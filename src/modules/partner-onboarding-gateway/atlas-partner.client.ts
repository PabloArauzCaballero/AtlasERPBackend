import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, Method } from 'axios';
import { firstValueFrom } from 'rxjs';
import { env } from '../../config/env';

/**
 * Cliente del expediente del partner, que vive en AtlasBackend.
 *
 * Existe porque **el frontend nunca habla con AtlasBackend de forma directa** (ver `.env.example`):
 * el navegador sólo conoce este origen y el salto lo da el servidor. Ese diseño es lo que permite
 * exponer el portal por un túnel sin exponer el backend de identidad, así que un módulo nuevo no
 * puede saltárselo: tiene que atravesarlo.
 *
 * Es un reenvío fino y deliberadamente tonto. **No decide nada**: no valida el expediente, no
 * conoce sus reglas y no reinterpreta sus errores más allá de traducir el código HTTP. Toda la
 * lógica vive donde vive la evidencia. Un gateway que empieza a opinar sobre el dominio acaba
 * siendo una segunda implementación que se desincroniza de la primera.
 */
@Injectable()
export class AtlasPartnerClient {
  constructor(private readonly http: HttpService) {}

  /**
   * Reenvía la llamada con el token del usuario que la hizo.
   *
   * El token es el del ACTOR, no una credencial de servicio, y es la decisión de seguridad de este
   * archivo: con una credencial de máquina, este gateway podría operar el expediente de cualquier
   * comercio y la única barrera sería el propio código. Con el token del actor, AtlasBackend aplica
   * sus `@Roles` y su `TenantGuard` sobre quien de verdad está pidiendo.
   */
  async forward<T>(input: {
    method: Method;
    path: string;
    accessToken: string | undefined;
    body?: unknown;
  }): Promise<T> {
    if (!input.accessToken) {
      throw new UnauthorizedException('No hay sesión de identidad para operar el expediente.');
    }

    try {
      const response = await firstValueFrom(
        this.http.request<{ data?: T } | T>({
          method: input.method,
          url: `${env.ATLAS_IDENTITY_BASE_URL}/${input.path.replace(/^\/+/, '')}`,
          data: input.body,
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'x-tenant-id': env.ATLAS_IDENTITY_TENANT_ID,
            Accept: 'application/json',
          },
          timeout: env.ATLAS_IDENTITY_TIMEOUT_MS,
        }),
      );

      // AtlasBackend envuelve sus respuestas en `{ requestId, data, timestamp }`. Se desenvuelve
      // aquí para que el portal reciba el contrato del dominio y no el sobre de otro servicio.
      const payload = response.data;
      return payload && typeof payload === 'object' && 'data' in payload
        ? ((payload as { data: T }).data)
        : (payload as T);
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Reenvía una lectura BINARIA: la imagen de un QR, el comprobante de una transferencia.
   *
   * Es un método aparte y no una bandera de `forward` porque lo que cambia no es un detalle: aquél
   * desenvuelve el sobre `{ requestId, data }` de AtlasBackend y devuelve un objeto del dominio, y
   * aquí no hay sobre que abrir — hay bytes. Meter las dos cosas en la misma firma obligaría a que
   * el tipo de retorno mintiera en una de las dos.
   *
   * El token sigue siendo el del ACTOR por la misma razón que en `forward`: con una credencial de
   * máquina este gateway podría descargar el comprobante bancario de cualquier cliente.
   */
  async forwardBinary(input: {
    method: Method;
    path: string;
    accessToken: string | undefined;
  }): Promise<{ buffer: Buffer; contentType: string }> {
    if (!input.accessToken) {
      throw new UnauthorizedException('No hay sesión de identidad para operar el expediente.');
    }

    try {
      const response = await firstValueFrom(
        this.http.request<ArrayBuffer>({
          method: input.method,
          url: `${env.ATLAS_IDENTITY_BASE_URL}/${input.path.replace(/^\/+/, '')}`,
          responseType: 'arraybuffer',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'x-tenant-id': env.ATLAS_IDENTITY_TENANT_ID,
            Accept: 'image/*,application/octet-stream',
          },
          timeout: env.ATLAS_IDENTITY_TIMEOUT_MS,
        }),
      );

      return {
        buffer: Buffer.from(response.data),
        contentType: (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream',
      };
    } catch (error) {
      throw this.translateBinaryError(error);
    }
  }

  /**
   * El error de una lectura binaria llega como bytes, no como JSON.
   *
   * Con `responseType: 'arraybuffer'`, axios entrega TAMBIÉN el cuerpo del error en binario, así
   * que `translateError` leía `data.error.message` sobre un `Buffer` y no encontraba nada: cada
   * 404 del upstream se convertía en «El servicio del expediente no respondió», que manda a buscar
   * el fallo al sitio equivocado. Aquí se decodifica antes de traducir.
   */
  private translateBinaryError(error: unknown): Error {
    const axiosError = error as AxiosError<ArrayBuffer>;
    const raw = axiosError.response?.data;
    if (raw) {
      try {
        const decoded = JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
        (axiosError as AxiosError<unknown>).response!.data = decoded;
      } catch {
        (axiosError as AxiosError<unknown>).response!.data = undefined;
      }
    }
    return this.translateError(axiosError);
  }

  /**
   * Traduce el fallo upstream al mismo código, conservando su mensaje.
   *
   * El mensaje se conserva **entero y a propósito**: AtlasBackend publica en él lo que un cuerpo
   * estructurado no sobrevive a su filtro global —qué requisitos faltan, en qué sucursal está ya
   * ese serial, qué expediente tiene ese NIT—. Reescribirlo aquí con un texto propio dejaría al
   * portal sin la única información que hace accionable el rechazo.
   */
  private translateError(error: unknown): Error {
    const axiosError = error as AxiosError<{ error?: { message?: string }; message?: string }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const message = body?.error?.message ?? body?.message ?? 'El servicio del expediente no respondió.';

    switch (status) {
      case 400:
        return new BadRequestException(message);
      case 401:
        return new UnauthorizedException(message);
      case 403:
        return new ForbiddenException(message);
      case 404:
        return new NotFoundException(message);
      case 409:
        return new ConflictException(message);
      case 422:
        return new UnprocessableEntityException(message);
      case 503:
        return new ServiceUnavailableException(message);
      default:
        // Sin respuesta (timeout, DNS, conexión rechazada) el upstream no está disponible; no es un
        // error del portal ni del comercio, y decir 500 haría buscar el fallo en el sitio errado.
        if (status === undefined) {
          return new ServiceUnavailableException('El servicio del expediente no está disponible.');
        }
        return new InternalServerErrorException(message);
    }
  }
}
