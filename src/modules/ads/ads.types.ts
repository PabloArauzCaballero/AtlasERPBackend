import type { Transaction } from 'sequelize';
import type { AuthUser } from '../../common/types/auth-context.types';

export interface ActorContext {
  user: AuthUser;
  requestId: string;
}

/** Naturaleza del actor que quedó registrado en `ad_audit_log.actor_type`. */
export type AdsAuditActorType = 'INTERNAL_ATLAS_USER' | 'MERCHANT_PORTAL_USER' | 'SYSTEM';

export interface AuditInput {
  actor: ActorContext;
  /** Por defecto `INTERNAL_ATLAS_USER`. El portal del comercio registra `MERCHANT_PORTAL_USER`. */
  actorType?: AdsAuditActorType;
  entityType: string;
  entityId: string;
  action: string;
  reason?: string;
  severity?: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  transaction?: Transaction;
}

export interface AuditResult {
  auditId: string;
}
