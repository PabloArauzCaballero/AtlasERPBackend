/**
 * Receptor S2S de los eventos de Core (P-14 · B20): `POST /integration/core/events`.
 *
 * Cierra el circuito Core → ERP: el aviso de pago que el cliente reporta y que el comercio
 * confirma o rechaza en Core llega al ERP una sola vez aunque Core reintente. El 2xx es el ACK
 * duradero y sólo sale después del commit de la inbox.
 *
 * Público respecto al JWT de usuario —llama un servicio— y protegido por `CoreSignatureGuard`
 * (HMAC sobre el cuerpo crudo, ventana de 300 s). 400 (sobre) y 422 (payload o tópico) = el evento,
 * tal cual, no se aceptará nunca: Core lo deja `dead`, visible. 401/503 = configuración: reintenta.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { EVENT_KEY_HEADER } from '../../../workers/outbox/http-event-publisher';
import { coreEnvelopeSchema, type CoreEnvelope } from '../integration/core-events.schemas';
import { CoreCreditEventsService } from '../integration/core-credit-events.service';
import { CorePaymentEventsService } from '../integration/core-payment-events.service';
import { CoreSignatureGuard } from '../integration/core-signature.guard';

@Controller('integration/core')
export class CoreEventsController {
  constructor(
    private readonly events: CorePaymentEventsService,
    private readonly creditEvents: CoreCreditEventsService,
  ) {}

  @Public()
  @UseGuards(CoreSignatureGuard)
  // Un backlog de Core que converge tras una caída llega en ráfaga: el tope general (120/min) lo frenaría.
  @Throttle({ default: { limit: 6_000, ttl: 60_000 } })
  @Post('events')
  @HttpCode(200)
  async receive(
    @Headers(EVENT_KEY_HEADER) eventKeyHeader: string | undefined,
    @Body(new ZodValidationPipe(coreEnvelopeSchema)) envelope: CoreEnvelope,
  ): Promise<{ eventKey: string; outcome: string }> {
    if (eventKeyHeader && eventKeyHeader !== envelope.eventKey) {
      throw new BadRequestException('EVENT_KEY_HEADER_MISMATCH');
    }
    // T-11: `credit.decision.recorded` no tiene forma de "claim" (sin cuota ni préstamo) — su
    // propio consumidor, sin la complejidad de cobertura/avisos de pago.
    const { outcome } =
      envelope.topic === 'credit.decision.recorded'
        ? await this.creditEvents.receive(envelope)
        : await this.events.receive(envelope);
    return { eventKey: envelope.eventKey, outcome };
  }
}
