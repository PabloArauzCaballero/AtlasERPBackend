import type { SiatLlamada, SiatOperacion, SiatTransport } from './siat-transport';
import { SiatTransportError } from './siat-transport';

/**
 * Transporte SOAP hacia el SIN (piloto y producción). Frente F7 del plan: se construye y prueba
 * contra el piloto cuando existan el token delegado y el `codigoSistema`. Hasta entonces responde
 * con un error explícito en vez de fingir un envío.
 */
export class SoapSiatTransport implements SiatTransport {
  constructor(readonly modo: 'piloto' | 'produccion') {}

  async invocar(operacion: SiatOperacion): Promise<SiatLlamada> {
    throw new SiatTransportError(
      'NOT_READY',
      `SIAT_SOAP_TRANSPORT_NOT_READY: el transporte SOAP al SIN (${this.modo}) todavía no está implementado; ${operacion.nombre} no se envió.`,
      { enviado: false },
    );
  }
}
