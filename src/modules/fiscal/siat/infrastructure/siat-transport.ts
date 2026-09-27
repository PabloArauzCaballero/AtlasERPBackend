/**
 * El puerto hacia el SIN. Un solo dominio fiscal, dos transportes: JSON hacia el emulador del
 * mock de proveedores y SOAP hacia el piloto/producción del SIN. Las solicitudes y respuestas
 * llevan los NOMBRES del WSDL (`SolicitudCuis`, `RespuestaServicioFacturacion`…): sólo cambia el
 * sobre.
 */

export type SiatServicio = 'codigos' | 'sincronizacion' | 'operaciones' | 'compra-venta';

export interface SiatOperacion {
  servicio: SiatServicio;
  nombre: string;
}

export const OPERACIONES = {
  cuis: { servicio: 'codigos', nombre: 'cuis' },
  cufd: { servicio: 'codigos', nombre: 'cufd' },
  verificarNit: { servicio: 'codigos', nombre: 'verificarNit' },
  verificarComunicacion: { servicio: 'codigos', nombre: 'verificarComunicacion' },
  registroEventoSignificativo: { servicio: 'operaciones', nombre: 'registroEventoSignificativo' },
  consultaEventoSignificativo: { servicio: 'operaciones', nombre: 'consultaEventoSignificativo' },
  recepcionFactura: { servicio: 'compra-venta', nombre: 'recepcionFactura' },
  recepcionPaqueteFactura: { servicio: 'compra-venta', nombre: 'recepcionPaqueteFactura' },
  validacionRecepcionPaqueteFactura: {
    servicio: 'compra-venta',
    nombre: 'validacionRecepcionPaqueteFactura',
  },
  verificacionEstadoFactura: { servicio: 'compra-venta', nombre: 'verificacionEstadoFactura' },
  anulacionFactura: { servicio: 'compra-venta', nombre: 'anulacionFactura' },
} as const satisfies Record<string, SiatOperacion>;

export function sincronizacion(nombre: string): SiatOperacion {
  return { servicio: 'sincronizacion', nombre };
}

export interface SiatMensaje {
  codigo: number;
  descripcion: string;
  advertencia?: boolean;
  numeroArchivo?: number;
  numeroDetalle?: number;
}

/** Campos comunes de toda `Respuesta…` del SIN; el resto depende de la operación. */
export interface SiatRespuesta {
  transaccion?: boolean;
  mensajesList?: SiatMensaje[];
  codigoEstado?: number;
  codigoDescripcion?: string;
  codigoRecepcion?: string;
  [campo: string]: unknown;
}

export interface SiatLlamada {
  respuesta: SiatRespuesta;
  httpStatus: number;
  latencyMs: number;
}

export type SiatFalloTipo = 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'NOT_READY' | 'INVALID_RESPONSE';

/**
 * Un fallo de TRANSPORTE: el SIN no contestó con una respuesta de negocio. `enviado` dice si el
 * cuerpo pudo salir: tras un envío, reintentar a ciegas duplica; primero se consulta el estado.
 */
export class SiatTransportError extends Error {
  constructor(
    readonly tipo: SiatFalloTipo,
    message: string,
    readonly detalle: { httpStatus?: number; latencyMs?: number; enviado: boolean },
  ) {
    super(message);
    this.name = 'SiatTransportError';
  }
}

export interface SiatInvocacionOpciones {
  /** Escenario del emulador. SÓLO pruebas y corridas QA; la interfaz nunca lo manda. */
  escenario?: string;
  /** Corrida del mock (`x-mock-*`), para aislar la evidencia de QA. */
  corrida?: Record<string, string>;
}

export interface SiatTransport {
  readonly modo: string;
  /** URL base del emulador (sólo el transporte JSON): de ella cuelga su buzón QA. */
  readonly baseUrl?: string;
  invocar(
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
    opciones?: SiatInvocacionOpciones,
  ): Promise<SiatLlamada>;
}

export const SIAT_TRANSPORT = Symbol('SIAT_TRANSPORT');
