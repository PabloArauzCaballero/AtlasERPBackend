import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../config/env';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import type { GenerateDocumentDto } from './documents.schemas';

export interface GeneratedPdf {
  buffer: Buffer;
  filename: string;
}

/** Plantilla genérica del worker: título, cifras, avisos, secciones con campos y tablas. */
const TEMPLATE_ID = 'generic-result-report';

/**
 * Puerta del ERP hacia el generador documental.
 *
 * El worker es un servicio aparte —el mismo que imprime los informes del motor de decisión— y se
 * autentica con una clave de SERVICIO, no con la sesión de quien pide. Por eso el navegador no
 * puede llamarlo directamente: tendría que llevar esa clave encima, y quien la tuviera podría
 * fabricar documentos con la identidad institucional de Atlas. El ERP autentica al usuario con su
 * propia sesión y sólo entonces pone la clave en el salto que sale de aquí.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly logger: PinoLoggerService) {}

  get enabled(): boolean {
    return Boolean(env.PDF_WORKER_URL && env.PDF_WORKER_SERVICE_KEY);
  }

  async generate(input: GenerateDocumentDto): Promise<GeneratedPdf> {
    const baseUrl = env.PDF_WORKER_URL;
    const serviceKey = env.PDF_WORKER_SERVICE_KEY;
    if (!baseUrl || !serviceKey) {
      throw new ServiceUnavailableException({
        code: 'PDF_WORKER_NOT_CONFIGURED',
        message:
          'La generación de PDF no está configurada en este despliegue: faltan PDF_WORKER_URL y PDF_WORKER_SERVICE_KEY.',
      });
    }

    const filename = sanitizeFilename(input.filename ?? 'documento.pdf');
    const url = new URL('/pdf/generate', baseUrl);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        // Un worker que no responde no puede dejar colgada la petición del ERP.
        signal: AbortSignal.timeout(env.PDF_WORKER_TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          accept: 'application/pdf',
          [env.PDF_WORKER_SERVICE_HEADER]: serviceKey,
        },
        body: JSON.stringify({
          templateId: TEMPLATE_ID,
          payload: input.payload,
          options: { filename, returnContent: true },
        }),
      });
    } catch (error) {
      this.logger.error('El generador documental no respondió.', {
        layer: 'service',
        module: 'documents',
        action: 'generate',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceUnavailableException({
        code: 'PDF_WORKER_UNREACHABLE',
        message: 'No fue posible contactar con el generador documental.',
      });
    }

    if (!response.ok) {
      const detalle = await response.text().catch(() => '');
      this.logger.error('El generador documental rechazó el documento.', {
        layer: 'service',
        module: 'documents',
        action: 'generate',
        status: response.status,
        detalle: detalle.slice(0, 500),
      });
      throw new ServiceUnavailableException({
        code: 'PDF_GENERATION_FAILED',
        message: `El generador documental respondió ${response.status}.`,
      });
    }

    /*
     * Un 200 con el tipo equivocado NO es un PDF.
     *
     * La misma ruta del worker devuelve el archivo o la ficha JSON según `Accept`; si el `accept`
     * se perdiera por el camino, lo que llegaría al disco del usuario sería un «PDF corrupto» que
     * por dentro son metadatos. Se comprueba aquí para que el fallo se vea al generar y no al
     * abrir el archivo.
     */
    const tipo = response.headers.get('content-type') ?? '';
    if (!tipo.toLowerCase().includes('application/pdf')) {
      throw new ServiceUnavailableException({
        code: 'PDF_GENERATION_WRONG_TYPE',
        message: `El generador respondió ${tipo || 'sin tipo declarado'} donde se esperaba application/pdf.`,
      });
    }

    return { buffer: Buffer.from(await response.arrayBuffer()), filename };
  }
}

/** Código del primer carácter, o 0 si el carácter no lo tuviera. */
const punto = (char: string): number => char.codePointAt(0) ?? 0;

/**
 * El nombre llega del navegador y termina en una cabecera `Content-Disposition`.
 *
 * Sin sanear, un salto de línea ahí parte la respuesta en dos —inyección de cabeceras— y una barra
 * convierte el nombre en una ruta. Se acota a lo que puede ser un nombre de archivo y nada más.
 * La comparación es NUMÉRICA a propósito: escribir el rango de control como literales dejaría
 * bytes invisibles en el fuente, y lo que no se ve no se revisa.
 */
function sanitizeFilename(raw: string): string {
  const limpio = [...raw]
    .filter((char) => punto(char) > 0x1f && punto(char) !== 0x7f)
    .filter((char) => char !== '/' && char !== '\\' && char !== '"')
    .join('')
    .replaceAll('..', '')
    .trim()
    .slice(0, 120);
  const seguro = limpio || 'documento.pdf';
  return seguro.toLowerCase().endsWith('.pdf') ? seguro : `${seguro}.pdf`;
}
