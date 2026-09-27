import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { SiatDispatchService } from './siat-dispatch.service';
import { SiatGatewayService } from './siat-gateway.service';

/**
 * Bucle de la cola fiscal DENTRO del proceso de la API, cada `SIAT_PROCESSOR_INTERVAL_MS`.
 *
 * No va en `worker-outbox` (como decía el plan) porque ese worker es `pg` crudo sin contenedor
 * Nest y el envío necesita los servicios fiscales. Es seguro con varias instancias a la vez
 * —Coolify levanta la nueva antes de retirar la vieja—: la bandera `running` sólo evita solapes
 * DENTRO del proceso; entre procesos manda la reclamación CAS por fila en la base.
 */
@Injectable()
export class FiscalDocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly gateway: SiatGatewayService,
    private readonly dispatch: SiatDispatchService,
    private readonly logger: PinoLoggerService,
  ) {}

  onModuleInit(): void {
    if (!this.gateway.activo || env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), env.SIAT_PROCESSOR_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatch.procesar();
    } catch (error) {
      this.logger.warn('La pasada de la cola fiscal falló; la siguiente reintenta.', {
        layer: 'processor',
        module: 'fiscal-siat',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
