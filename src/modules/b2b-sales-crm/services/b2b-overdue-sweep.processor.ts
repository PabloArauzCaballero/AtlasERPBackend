import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { B2BOverdueSweepService } from './b2b-overdue-sweep.service';

/**
 * Corre la pasada de cuotas vencidas dentro del proceso del API, como el procesador de correo:
 * este despliegue no tiene procesos de trabajo aparte (el worker de outbox no está en el compose),
 * así que un worker separado no correría nunca. El intervalo es largo porque el hecho que se
 * detecta —una fecha que pasó— cambia una vez al día.
 */
@Injectable()
export class B2BOverdueSweepProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly service: B2BOverdueSweepService,
    private readonly logger: PinoLoggerService,
  ) {}

  onModuleInit(): void {
    if (!env.BNPL_OVERDUE_SWEEP_ENABLED) return;
    this.timer = setInterval(() => void this.tick(), env.BNPL_OVERDUE_SWEEP_INTERVAL_MS);
    this.timer.unref();
    /* La primera pasada, al arrancar: un despliegue no debería esperar una hora para ponerse al día. */
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.sweep();
    } catch (error) {
      // Un fallo transitorio (DB no lista) no tumba el proceso: el siguiente tick reintenta.
      this.logger.warnContext(B2BOverdueSweepProcessor.name, 'BNPL overdue sweep tick failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
