import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import {
  AccountingDocumentModel,
  DocumentAuditLogModel,
  JournalEntryLineModel,
  JournalEntryModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { normalizeAmount } from '../../../../common/money/decimal-amount.util';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import { ResolvedAccountingDocument, localCurrencyAmountOf } from '../domain/accounting-draft';
import { ResolvedApproval } from '../domain/approval-policy';
import { AccountingEventOutbox } from './accounting-event-outbox.service';

const DRAFT_AFFECTED_TABLES = [
  'atlas_accounting.accounting_document',
  'atlas_accounting.journal_entry',
  'atlas_accounting.journal_entry_line',
  'atlas_accounting.document_audit_log',
  'atlas_accounting.event_outbox',
];

/** Escribe el borrador: documento, asiento, líneas, auditoría, evento y bitácora de negocio. */
@Injectable()
export class DocumentDraftRecorder {
  constructor(
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly outbox: AccountingEventOutbox,
    @InjectModel(AccountingDocumentModel)
    private readonly accountingDocumentModel: typeof AccountingDocumentModel,
    @InjectModel(JournalEntryModel) private readonly journalEntryModel: typeof JournalEntryModel,
    @InjectModel(JournalEntryLineModel)
    private readonly journalEntryLineModel: typeof JournalEntryLineModel,
    @InjectModel(DocumentAuditLogModel)
    private readonly auditLogModel: typeof DocumentAuditLogModel,
  ) {}

  async record(
    input: ResolvedAccountingDocument,
    facts: { approval: ResolvedApproval; policySnapshotId: string | null },
    user: AuthUser,
    transaction: Transaction,
  ) {
    const { approval } = facts;
    const document = await this.accountingDocumentModel.create(
      {
        legalEntityId: input.legalEntityId,
        sourceSystem: input.sourceSystem,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        documentType: input.documentType,
        documentNo: input.documentNo,
        documentDate: input.documentDate,
        postingDate: input.postingDate,
        accountingPeriodId: input.accountingPeriodId,
        ledgerId: input.ledgerId,
        currencyCode: input.currencyCode,
        status: 'DRAFT',
        approvalStatus: approval.approvalStatus,
        approvalPolicyRef: approval.approvalPolicyRef,
        policySnapshotId: facts.policySnapshotId,
        createdBy: user.sub,
      },
      { transaction },
    );

    const journal = await this.journalEntryModel.create(
      {
        accountingDocumentId: document.id,
        journalNo: `${input.documentNo}-JRN`,
        postingStatus: 'DRAFT',
      },
      { transaction },
    );

    await this.journalEntryLineModel.bulkCreate(
      input.lines.map((line, index) => ({
        journalEntryId: journal.id,
        lineNo: index + 1,
        glAccountId: line.glAccountId,
        debit: normalizeAmount(line.debit),
        credit: normalizeAmount(line.credit),
        currencyCode: line.currencyCode,
        amountLc: localCurrencyAmountOf(line),
        partnerId: line.partnerId,
        costCenterId: line.costCenterId,
        profitCenterId: line.profitCenterId,
        taxCodeId: line.taxCodeId,
        referenceType: line.referenceType,
        referenceId: line.referenceId,
        description: line.description,
      })),
      { transaction },
    );

    await this.auditLogModel.create(
      {
        accountingDocumentId: document.id,
        eventType: 'DRAFT_CREATED',
        eventPayload: {
          documentNo: input.documentNo,
          lineCount: input.lines.length,
          approval: {
            status: approval.approvalStatus,
            policyRef: approval.approvalPolicyRef,
            reason: approval.reason,
          },
        },
        actorId: user.sub,
      },
      { transaction },
    );

    await this.outbox.publish(
      {
        topic: 'accounting.document.draft_created',
        aggregateType: 'accounting_document',
        aggregateId: document.id,
        eventKey: `accounting-document-draft-${document.id}`,
        payload: { accountingDocumentId: document.id, documentNo: input.documentNo },
      },
      transaction,
    );

    await this.businessActionLogsService.record({
      moduleCode: 'ACCOUNTING',
      businessProcess: 'GENERAL_LEDGER_POSTING_PREPARATION',
      actionCode: 'CREATE_ACCOUNTING_DRAFT_WITH_JOURNAL',
      actorUserId: user.sub,
      actorRole: user.role ?? null,
      aggregateType: 'ACCOUNTING_DOCUMENT',
      aggregateId: document.id,
      affectedTables: DRAFT_AFFECTED_TABLES,
      affectedRecordCount: 4 + input.lines.length,
      status: 'SUCCESS',
      inputSummary: { documentNo: input.documentNo, lineCount: input.lines.length },
      outputSummary: { documentId: document.id, journalId: journal.id },
      transaction,
    });

    return { document, journal };
  }
}
