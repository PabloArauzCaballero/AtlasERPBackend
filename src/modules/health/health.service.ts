import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { getServedIdentity } from '../../common/build-info/build-info';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';

export interface VersionPayload {
  service: string;
  version: string;
  commit: string;
  builtAt: string | null;
  environment: string;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {
    if (getServedIdentity().runtimeConflict) {
      this.logger.warnContext(
        HealthService.name,
        'APP_COMMIT_SHA contradice el commit compilado; se sirve el compilado',
        {
          compiled: getServedIdentity().commit,
        },
      );
    }
  }

  health(): { status: 'ok'; service: string } {
    this.logger.debugContext(HealthService.name, 'Health check requested');
    return { status: 'ok', service: 'atlas-integrated-backend' };
  }

  version(): VersionPayload {
    const identity = getServedIdentity();
    return {
      service: 'atlas-integrated-backend',
      version: process.env.APP_VERSION ?? 'unknown',
      commit: identity.commit,
      builtAt: identity.builtAt,
      environment: process.env.NODE_ENV ?? 'unknown',
    };
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
