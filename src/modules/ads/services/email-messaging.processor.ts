import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../../config/env';
import { EmailMessagingService } from './email-messaging.service';

@Injectable()
export class EmailMessagingProcessor implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly service: EmailMessagingService) {}
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
    } finally {
      this.running = false;
    }
  }
}
