import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditRepository } from '../repositories/audit.repository';
import type { AuditInput, AuditResult } from '../ads.types';
import type { AuditQueryDto } from '../ads.dtos';
import { serializePaginated } from '../ads.mappers';

@Injectable()
export class AdsAuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AdsAuditService.name);
  }

  async record(input: AuditInput): Promise<AuditResult> {
    const audit = await this.auditRepository.create(
      {
        actorUserId: input.actor.user.sub,
        actorType: 'INTERNAL_ATLAS_USER',
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        reason: input.reason ?? null,
        severity: input.severity ?? 'INFO',
        beforeJson: input.before ?? null,
        afterJson: input.after ?? null,
        requestId: input.actor.requestId,
      },
      input.transaction,
    );
    this.logger.info(
      {
        auditId: audit.id,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
      },
      'Audit entry recorded',
    );
    return { auditId: audit.id };
  }

  async list(query: AuditQueryDto) {
    const result = await this.auditRepository.list(query);
    return serializePaginated(result);
  }
}
