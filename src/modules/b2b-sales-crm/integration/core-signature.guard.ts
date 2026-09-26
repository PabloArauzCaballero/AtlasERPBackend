/**
 * Guard del receptor de eventos de Core (P-14): firma HMAC sobre el cuerpo CRUDO y ventana
 * anti-replay, con el MISMO esquema que el outbox del ERP (`verifyOutboxSignature`).
 *
 * La ruta es `@Public()` respecto al JWT de USUARIO —quien llama es un servicio— y esta firma es su
 * regla de autorización. Sin `CORE_EVENTS_SIGNING_SECRET` responde 503 y Core reintenta: cerrada,
 * nunca abierta. Un secreto por sentido: el de este receptor no sirve para firmar el outbox del ERP.
 */
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { env } from '../../../config/env';
import {
  SIGNATURE_HEADER,
  verifyOutboxSignature,
} from '../../../workers/outbox/http-event-publisher';

export interface RequestWithRawBody {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

@Injectable()
export class CoreSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = env.CORE_EVENTS_SIGNING_SECRET;
    if (!secret) throw new ServiceUnavailableException('CORE_EVENTS_NOT_CONFIGURED');
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    if (!request.rawBody) throw new BadRequestException('RAW_JSON_BODY_REQUIRED');
    const header = request.headers[SIGNATURE_HEADER];
    const valid = verifyOutboxSignature({
      secret,
      header: Array.isArray(header) ? header[0] : header,
      rawBody: request.rawBody.toString('utf8'),
      toleranceSeconds: env.CORE_EVENTS_SIGNATURE_TOLERANCE_SECONDS,
    });
    if (!valid) throw new UnauthorizedException('CORE_EVENT_SIGNATURE_INVALID');
    return true;
  }
}
