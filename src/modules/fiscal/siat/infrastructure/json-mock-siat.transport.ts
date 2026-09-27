import type {
  SiatInvocacionOpciones,
  SiatLlamada,
  SiatOperacion,
  SiatRespuesta,
  SiatTransport,
} from './siat-transport';
import { SiatTransportError } from './siat-transport';

/**
 * Transporte JSON hacia el emulador del SIN (`AtlasExternalProvidersMock`, `/mock/siat`).
 * Petición `{ input: <Solicitud…> }`, cabecera `apikey: TokenApi …`; la respuesta trae los campos
 * de la `Respuesta…` del WSDL. Nunca registra cabeceras.
 */
export class JsonMockSiatTransport implements SiatTransport {
  readonly modo = 'mock_server';

  constructor(
    readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async invocar(
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
    opciones: SiatInvocacionOpciones = {},
  ): Promise<SiatLlamada> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/${operacion.servicio}/${operacion.nombre}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      apikey: `TokenApi ${this.token}`,
      ...(opciones.corrida ?? {}),
    };
    if (opciones.escenario) headers['x-mock-scenario'] = opciones.escenario;

    const inicio = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: solicitud }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const latencyMs = Date.now() - inicio;
      const esTimeout = error instanceof Error && error.name === 'TimeoutError';
      // Con `fetch` no se sabe si el cuerpo llegó a salir: se asume que SÍ, que es lo prudente
      // (obliga a consultar el estado por CUF antes de reenviar).
      throw new SiatTransportError(
        esTimeout ? 'TIMEOUT' : 'NETWORK',
        esTimeout
          ? `El SIN no respondió en ${this.timeoutMs} ms (${operacion.nombre}).`
          : `No se pudo contactar con el SIN (${operacion.nombre}).`,
        { latencyMs, enviado: true },
      );
    }
    const latencyMs = Date.now() - inicio;
    const texto = await response.text();
    if (!response.ok) {
      throw new SiatTransportError(
        'HTTP',
        `El SIN respondió HTTP ${response.status} (${operacion.nombre}).`,
        { httpStatus: response.status, latencyMs, enviado: response.status >= 500 },
      );
    }
    let respuesta: SiatRespuesta;
    try {
      respuesta = JSON.parse(texto) as SiatRespuesta;
    } catch {
      throw new SiatTransportError(
        'INVALID_RESPONSE',
        `El SIN devolvió una respuesta que no se puede leer (${operacion.nombre}).`,
        { httpStatus: response.status, latencyMs, enviado: true },
      );
    }
    if (!respuesta || typeof respuesta !== 'object') {
      throw new SiatTransportError(
        'INVALID_RESPONSE',
        `El SIN devolvió una respuesta vacía (${operacion.nombre}).`,
        { httpStatus: response.status, latencyMs, enviado: true },
      );
    }
    return { respuesta, httpStatus: response.status, latencyMs };
  }
}
