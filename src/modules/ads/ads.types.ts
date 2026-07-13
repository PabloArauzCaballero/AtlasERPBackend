import type { Transaction } from 'sequelize';
import type { AuthUser } from '../../common/types/auth-context.types';

export interface ActorContext {
  user: AuthUser;
  requestId: string;
}

export interface AuditInput {
  actor: ActorContext;
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
