import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { createHash } from 'node:crypto';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { SiatIssuerProfileModel, SiatTransactionLogModel } from '../../../../database/models';
import { JsonMockSiatTransport } from '../infrastructure/json-mock-siat.transport';
import { SoapSiatTransport } from '../infrastructure/soap-siat.transport';
import {
  SiatInvocacionOpciones,
  SiatLlamada,
  SiatOperacion,
  SiatTransport,
  SiatTransportError,
} from '../infrastructure/siat-transport';
import { facturacionFiscalApagada, sinNoDisponible } from './siat-errors';

/** Token de prueba del emulador: no es un secreto, el emulador acepta cualquiera. */
const TOKEN_EMULADOR = 'atlas-erp-emulador';
const SISTEMA_EMULADOR = 'ATLAS-ERP-EMULADOR';

/** Campos que no se guardan tal cual en la bitácora: se sustituyen por su tamaño y hash. */
function redactarSolicitud(solicitud: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...solicitud };
  if (typeof copia.archivo === 'string') {
    copia.archivo = {
      base64Bytes: copia.archivo.length,
      sha256: createHash('sha256').update(copia.archivo).digest('hex'),
    };
  }
  return copia;
}

/** Las listas de catálogos pueden ser miles de filas: en la bitácora basta su tamaño. */
function resumirRespuesta(respuesta: Record<string, unknown>): Record<string, unknown> {
  const copia: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(respuesta)) {
    copia[campo] =
      campo.startsWith('lista') && Array.isArray(valor) ? { items: valor.length } : valor;
  }
  return copia;
}

/**
 * Único punto por el que el ERP habla con el SIN. Elige el transporte según `SIAT_MODE`, arma los
 * campos de sistema (`codigoAmbiente`, `codigoSistema`) y deja cada llamada en
 * `siat_transaction_log` —operación, latencia, código, respuesta— sin cabeceras.
 */
@Injectable()
export class SiatGatewayService {
  private transportCache: SiatTransport | null = null;

  constructor(
    @InjectModel(SiatTransactionLogModel)
    private readonly logModel: typeof SiatTransactionLogModel,
    private readonly logger: PinoLoggerService,
  ) {}

  /** El modo lo fija `SIAT_MODE`, salvo que una prueba haya inyectado su transporte. */
  get modo(): string {
    return this.transportCache?.modo ?? env.SIAT_MODE;
  }

  get activo(): boolean {
    return this.modo !== 'disabled';
  }

  /**
   * Lo que el modo significa para quien mira la pantalla (WP14-ERPB): si alguna factura llega de
   * verdad a Impuestos Nacionales. Hoy ninguno lo hace: `mock_server` es el emulador y el transporte
   * SOAP de `piloto`/`produccion` responde `SIAT_SOAP_TRANSPORT_NOT_READY`.
   */
  get estadoDelModo(): { mode: string; activo: boolean; transporteReal: boolean; nota: string } {
    const mode = this.modo;
    const nota =
      mode === 'disabled'
        ? 'Facturación electrónica apagada: las facturas se emiten sin documento fiscal (el PDF dice «representación interna») y nada se envía a Impuestos Nacionales.'
        : mode === 'mock_server'
          ? 'Emulador del SIN (pruebas): nada llega a Impuestos Nacionales; CUF, validaciones y anulaciones son simulados.'
          : `El envío al SIN (${mode}) todavía no está implementado (SIAT_SOAP_TRANSPORT_NOT_READY): ninguna factura se envía a Impuestos Nacionales.`;
    return { mode, activo: this.activo, transporteReal: false, nota };
  }

  /** URL del emulador en uso (la del transporte inyectado o `SIAT_MOCK_BASE_URL`). */
  get mockBaseUrl(): string | null {
    if (this.modo !== 'mock_server') return null;
    return this.transportCache?.baseUrl ?? env.SIAT_MOCK_BASE_URL ?? null;
  }

  /** 1 producción, 2 piloto. El emulador ES el piloto. */
  get codigoAmbiente(): number {
    return this.modo === 'produccion' ? 1 : 2;
  }

  get codigoSistema(): string {
    return env.SIAT_CODIGO_SISTEMA ?? SISTEMA_EMULADOR;
  }

  /** Permite a las pruebas inyectar un transporte falso. */
  usarTransporte(transporte: SiatTransport | null): void {
    this.transportCache = transporte;
  }

  private transporte(): SiatTransport {
    if (this.transportCache) return this.transportCache;
    switch (env.SIAT_MODE) {
      case 'mock_server':
        this.transportCache = new JsonMockSiatTransport(
          env.SIAT_MOCK_BASE_URL!,
          env.SIAT_TOKEN_DELEGADO ?? TOKEN_EMULADOR,
          env.SIAT_HTTP_TIMEOUT_MS,
        );
        return this.transportCache;
      case 'piloto':
      case 'produccion':
        this.transportCache = new SoapSiatTransport(env.SIAT_MODE);
        return this.transportCache;
      default:
        throw facturacionFiscalApagada();
    }
  }

  /** Campos de sistema de toda solicitud que lleva datos del emisor. */
  solicitudBase(perfil: SiatIssuerProfileModel): Record<string, unknown> {
    return {
      codigoAmbiente: this.codigoAmbiente,
      codigoSistema: this.codigoSistema,
      nit: Number(perfil.nit),
      codigoSucursal: perfil.codigoSucursal,
      codigoPuntoVenta: perfil.codigoPuntoVenta,
      codigoModalidad: perfil.codigoModalidad,
    };
  }

  /**
   * Llama al SIN. Un fallo de transporte se registra y se relanza tal cual (`SiatTransportError`):
   * quien llama decide si consulta, reintenta o entra en contingencia. `lanzarSiFalla` lo convierte
   * en 503 para los endpoints de operador.
   */
  async llamar(
    perfilId: string | null,
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
    opciones: SiatInvocacionOpciones = {},
  ): Promise<SiatLlamada> {
    const transporte = this.transporte();
    try {
      const llamada = await transporte.invocar(operacion, solicitud, opciones);
      await this.registrar(perfilId, operacion, solicitud, {
        response: resumirRespuesta(llamada.respuesta),
        codigoEstado:
          llamada.respuesta.codigoEstado ?? llamada.respuesta.mensajesList?.[0]?.codigo ?? null,
        httpStatus: llamada.httpStatus,
        latencyMs: llamada.latencyMs,
        ok: llamada.respuesta.transaccion !== false,
        error: null,
      });
      return llamada;
    } catch (error) {
      if (error instanceof SiatTransportError) {
        await this.registrar(perfilId, operacion, solicitud, {
          response: null,
          codigoEstado: null,
          httpStatus: error.detalle.httpStatus ?? null,
          latencyMs: error.detalle.latencyMs ?? 0,
          ok: false,
          error: `${error.tipo}: ${error.message}`,
        });
      }
      throw error;
    }
  }

  async llamarOperador(
    perfilId: string | null,
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
  ): Promise<SiatLlamada> {
    try {
      return await this.llamar(perfilId, operacion, solicitud);
    } catch (error) {
      if (error instanceof SiatTransportError)
        throw sinNoDisponible(operacion.nombre, error.message);
      throw error;
    }
  }

  private async registrar(
    perfilId: string | null,
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
    resultado: {
      response: unknown;
      codigoEstado: number | null;
      httpStatus: number | null;
      latencyMs: number;
      ok: boolean;
      error: string | null;
    },
  ): Promise<void> {
    try {
      await this.logModel.create({
        issuerProfileId: perfilId,
        operacion: operacion.nombre,
        mode: this.modo,
        requestRedacted: redactarSolicitud(solicitud),
        ...resultado,
      });
    } catch (error) {
      // La bitácora no puede tumbar una emisión: se avisa y se sigue.
      this.logger.warn('No se pudo registrar la llamada al SIN en siat_transaction_log.', {
        layer: 'service',
        module: 'fiscal-siat',
        operacion: operacion.nombre,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
