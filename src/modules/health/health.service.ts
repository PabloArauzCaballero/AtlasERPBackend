import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  health(): { status: 'ok'; service: string } {
    this.logger.debugContext(HealthService.name, 'Health check requested');
    return { status: 'ok', service: 'atlas-integrated-backend' };
  }

  async ready(): Promise<{ status: 'ready'; database: 'ok' }> {
    const startedAt = Date.now();
    try {
      await this.sequelize.authenticate();
    } catch (error) {
      this.logger.errorContext(HealthService.name, 'Readiness check failed', {
        database: 'error',
        durationMs: Date.now() - startedAt,
        error,
      });
      throw new ServiceUnavailableException({
        code: 'READINESS_DATABASE_UNAVAILABLE',
        message: 'La base de datos no está disponible para el API.',
      });
    }

    this.logger.infoContext(HealthService.name, 'Readiness check passed', {
      database: 'ok',
      durationMs: Date.now() - startedAt,
    });
    return { status: 'ready', database: 'ok' };
  }
}
