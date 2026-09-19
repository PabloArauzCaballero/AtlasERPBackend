import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';
import { recordSpanError } from '../../../common/observability/trace-error';
import { TracingService } from '../../../common/observability/tracing.service';
import { APP_ATTRIBUTES, SPAN_NAMES } from '../../../observability/telemetry.constants';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { EmailMessagingService } from './email-messaging.service';

@Injectable()
export class EmailMessagingProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(
    private readonly tracing: TracingService,
    private readonly service: EmailMessagingService,
    private readonly logger: PinoLoggerService,
  ) {}
  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), env.EMAIL_WORKER_POLL_INTERVAL_MS);
    this.timer.unref();
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
        [APP_ATTRIBUTES.module]: 'ads',
        [APP_ATTRIBUTES.operation]: 'run',
        [APP_ATTRIBUTES.jobName]: 'ads.email-messaging',
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
      await this.service.processDue();
      span.setAttribute(APP_ATTRIBUTES.jobOutcome, 'completed');
    } catch (error) {
      span.setAttribute(APP_ATTRIBUTES.jobOutcome, 'failed');
      recordSpanError(span, error);
      // Un fallo transitorio (DB no lista, red, proveedor) no debe tumbar el proceso:
      // el siguiente tick reintenta.
      this.logger.warnContext(EmailMessagingProcessor.name, 'Email messaging tick failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
