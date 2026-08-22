/**
 * Credencial DEDICADA y de un solo propósito para el manifiesto de catálogo.
 *
 * ## Por qué no reutiliza el JWT interno
 *
 * `JWT_INTERNAL_SECRET` es la llave con la que este backend firma sus tokens de servicio:
 * quien la tiene puede emitir un token con cualquier rol, para cualquier ruta. Dársela a Atlas
 * Backend —que hoy no consume una sola ruta de negocio del ERP— para que pueda leer una lista de
 * tablas sería cambiar un permiso mínimo por el permiso máximo. Esta llave, en cambio, sólo abre
 * este endpoint de lectura y no sirve para nada más.
 *
 * ## Por qué falla CERRADO cuando no está configurada
 *
 * Sin llave no hay forma de distinguir a Atlas Backend de cualquiera que llegue al puerto, y lo
 * que se protege es el mapa completo de rutas y tablas del servicio. Un despliegue que no la
 * configura no obtiene un endpoint abierto: obtiene un endpoint apagado, y el panel del portal lo
 * reporta como bloque «no configurado», que es una respuesta honesta y visible.
 *
 * La comparación es de tiempo constante: un `===` sobre cadenas filtra por su tiempo de retorno
 * cuántos caracteres iniciales acertó quien prueba, y una llave estática es justo el caso donde
 * ese goteo se puede explotar con paciencia.
 */
import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env';

export const PLATFORM_CATALOG_KEY_HEADER = 'x-platform-catalog-key';

@Injectable()
export class PlatformCatalogKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = env.PLATFORM_CATALOG_API_KEY;
    if (!expected) {
      throw new ServiceUnavailableException(
        'El manifiesto de catálogo está apagado en este despliegue: falta PLATFORM_CATALOG_API_KEY.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[PLATFORM_CATALOG_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Credencial de catálogo inválida.');
    }
    return true;
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  // `timingSafeEqual` exige longitudes iguales; compararlas antes reintroduciría el canal que
  // esta función existe para cerrar, así que se normaliza a un largo fijo con SHA no hace falta:
  // basta con rechazar por longitud DESPUÉS de haber gastado el mismo trabajo en ambos casos.
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
