import type { Transaction } from 'sequelize';
import type { BusinessActionLogStatus } from '../../database/models/business_action_log.model';

export interface RecordBusinessActionLogInput {
  moduleCode: string;
  businessProcess: string;
  actionCode: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  sourceSystem?: string;
  affectedTables: string[];
  affectedRecordCount: number;
  status: BusinessActionLogStatus;
  inputSummary?: Record<string, unknown> | null;
  outputSummary?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  transaction?: Transaction;
}
