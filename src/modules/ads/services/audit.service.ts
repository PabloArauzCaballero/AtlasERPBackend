import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditRepository } from '../repositories/audit.repository';
import type { AuditInput, AuditResult } from '../ads.types';
import type { AuditQueryDto } from '../ads.dtos';
import { serializePaginated } from '../ads.mappers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `ad_audit_log.request_id` es `uuid`, pero `RequestContextMiddleware` acepta cualquier
 * `X-Request-Id` entrante que cumpla `[A-Za-z0-9._:-]{8,120}`. Un correlador no-UUID enviado por
 * un cliente haría fallar el INSERT de auditoría y, con él, toda la transacción de negocio.
 * Se conserva el correlador solo cuando es un UUID; en caso contrario se registra sin él.
 */
export function normalizeAuditRequestId(requestId: string | undefined): string | null {
  return requestId && UUID_PATTERN.test(requestId) ? requestId : null;
}

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
        actorType: input.actorType ?? 'INTERNAL_ATLAS_USER',
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        reason: input.reason ?? null,
        severity: input.severity ?? 'INFO',
        beforeJson: input.before ?? null,
        afterJson: input.after ?? null,
        requestId: normalizeAuditRequestId(input.actor.requestId),
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
