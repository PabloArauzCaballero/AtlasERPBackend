import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { fechaHoraLocal } from '../../fiscal/siat/domain/fecha-local';
import { MerchantBillingCycleService } from './merchant-billing-cycle.service';

const CADA_MS = 15 * 60 * 1000;

/**
 * Dispara el cierre el día 1 a partir de `MERCHANT_BILLING_CLOSE_HOUR_LOCAL` (hora de Bolivia).
 * Apagado por defecto (`MERCHANT_BILLING_AUTO_ENABLED=false`). Revisa cada 15 min: la corrida es
 * idempotente por ciclo, así que repetir la comprobación no factura dos veces.
 */
@Injectable()
export class MerchantBillingCycleProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly service: MerchantBillingCycleService,
    private readonly logger: PinoLoggerService,
  ) {}

  onModuleInit(): void {
    if (!env.MERCHANT_BILLING_AUTO_ENABLED) return;
    this.timer = setInterval(() => void this.tick(), CADA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(ahora = new Date()): Promise<void> {
    const local = fechaHoraLocal(ahora, 'America/La_Paz');
    const dia = Number(local.slice(8, 10));
    const hora = Number(local.slice(11, 13));
    if (dia !== 1 || hora < env.MERCHANT_BILLING_CLOSE_HOUR_LOCAL || this.running) return;
    this.running = true;
    try {
      await this.service.ejecutar({ trigger: 'SCHEDULE', ahora });
    } catch (error) {
      this.logger.warnContext(
        MerchantBillingCycleProcessor.name,
        'El cierre de facturación falló',
        {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      this.running = false;
    }
  }
}
