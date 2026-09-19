import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';
import { recordSpanError } from '../../../common/observability/trace-error';
import { TracingService } from '../../../common/observability/tracing.service';
import { APP_ATTRIBUTES, SPAN_NAMES } from '../../../observability/telemetry.constants';
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
    private readonly tracing: TracingService,
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

  /**
   * Traza RAÍZ, una por tanda.
   *
   * Esta tanda no nace de ninguna petición: heredar el contexto de lo que el proceso estuviera
   * atendiendo colgaría el trabajo de fondo de una traza ajena y arbitraria. `runInRootSpan`
   * abre una traza nueva, que es lo que una ejecución periódica es.
   *
   * Corre DENTRO del proceso del API, así que sin esto su trabajo —y sus consultas— aparecerían
   * como spans sueltos sin nada que los explique.
   */
  private tick(): Promise<void> {
    return this.tracing.runInRootSpan(
      SPAN_NAMES.jobRun,
      {
        [APP_ATTRIBUTES.module]: 'b2b-sales-crm',
        [APP_ATTRIBUTES.operation]: 'run',
        [APP_ATTRIBUTES.jobName]: 'b2b.overdue-sweep',
      },
      (span) => this.runTick(span),
    );
  }

  private async runTick(span: Span): Promise<void> {
    if (this.running) {
      // Una tanda que se salta por solapamiento es una respuesta, no un silencio: si se repite,
      // el intervalo es más corto que la duración real del trabajo.
      span.setAttribute(APP_ATTRIBUTES.jobOutcome, 'skipped_overlap');
      return;
    }
    this.running = true;
    try {
      await this.service.sweep();
      span.setAttribute(APP_ATTRIBUTES.jobOutcome, 'completed');
    } catch (error) {
      span.setAttribute(APP_ATTRIBUTES.jobOutcome, 'failed');
      recordSpanError(span, error);
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
