import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { EmailMessagingService } from './email-messaging.service';

@Injectable()
export class EmailMessagingProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(
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
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.processDue();
    } catch (error) {
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
