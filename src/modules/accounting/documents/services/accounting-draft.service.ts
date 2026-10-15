import { Injectable } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { TracingService } from '../../../../common/observability/tracing.service';
import { APP_ATTRIBUTES, SPAN_NAMES } from '../../../../observability/telemetry.constants';
import {
  BulkCreateAccountingDocumentsDto,
  CreateAccountingDocumentDto,
} from '../../shared/schemas/accounting.schemas';
import { DoubleEntryValidator } from '../../posting/validators/double-entry.validator';
import { SapPostingValidationService } from '../../posting/services/sap-posting-validation.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PostingRuleSnapshotService } from '../../posting/services/posting-rule-snapshot.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { assertClientApprovalStatus } from '../domain/document-approval';
import { resolveApprovalForCreation } from '../domain/approval-policy';
import { AccountingDraftInput, CreateDraftOptions } from '../domain/accounting-draft';
import { env } from '../../../../config/env';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import { AccountingDocumentQueries } from './accounting-document-queries.service';
import { DocumentDraftRecorder } from './document-draft-recorder.service';
import { DocumentDraftResolver } from './document-draft-resolver.service';

/** Creación de borradores contables, uno a uno o en lote. */
@Injectable()
export class AccountingDraftService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly resolver: DocumentDraftResolver,
    private readonly recorder: DocumentDraftRecorder,
    private readonly queries: AccountingDocumentQueries,
    private readonly doubleEntryValidator: DoubleEntryValidator,
    private readonly sapPostingValidationService: SapPostingValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly postingRuleSnapshotService: PostingRuleSnapshotService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly logger: PinoLoggerService,
    private readonly tracing: TracingService,
  ) {}

  async createDraft(input: CreateAccountingDocumentDto, user: AuthUser) {
    this.logger.info('Inicio de creación de borrador contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'createDraft',
      documentNo: input.documentNo,
      legalEntityId: input.legalEntityId,
      userId: user.sub,
    });
    return this.sequelize.transaction((transaction) =>
      this.createDraftInTransaction(input, user, transaction),
    );
  }

  /**
   * `accounting.document.draft` NO es un span redundante pese a existir el endpoint que lo llama:
   * `createDraftBulk` lo invoca en bucle, y en un lote de cincuenta documentos es la única forma
   * de ver CUÁL tardó o cuál falló. Ningún atributo lleva importes, razón social ni NIT.
   */
  createDraftInTransaction(
    rawInput: AccountingDraftInput,
    user: AuthUser,
    transaction: Transaction,
    options: CreateDraftOptions = {},
  ) {
    return this.tracing.runInSpan(
      SPAN_NAMES.accountingDocumentDraft,
      {
        [APP_ATTRIBUTES.module]: 'accounting',
        [APP_ATTRIBUTES.operation]: 'draft',
        [APP_ATTRIBUTES.entityType]: 'accounting_document',
      },
      () => this.createDraftInSpan(rawInput, user, transaction, options),
    );
  }

  private async createDraftInSpan(
    rawInput: AccountingDraftInput,
    user: AuthUser,
    transaction: Transaction,
    options: CreateDraftOptions,
  ) {
    // El alcance se comprueba ANTES de numerar o deducir período y libro: esas lecturas son de la
    // entidad pedida, y hacerlas primero convertía los errores («esta empresa no tiene ejercicio
    // fiscal») en un oráculo sobre entidades ajenas al token. Lo cubre
    // `test/accounting-documents-db.e2e-spec.ts` (403 y ninguna fila escrita).
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
    // APPROVED o REJECTED no los elige quien crea el documento: los decide el servidor (ATL-03).
    assertClientApprovalStatus(rawInput.approvalStatus);
    // La necesidad de aprobación la decide la política del servidor con hechos del servidor. Va antes
    // de numerar: sin política no se consume un número ni se escribe nada (ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE).
    const approval = resolveApprovalForCreation(
      { origin: options.origin ?? 'MANUAL' },
      env.ACCOUNTING_APPROVAL_POLICY,
      rawInput.approvalStatus,
    );
    const numbered = await this.resolver.withDocumentNumber(rawInput, transaction);
    const input = await this.resolver.withResolvedDefaults(numbered, transaction);
    this.doubleEntryValidator.validate(input.lines);
    await this.sapPostingValidationService.assertDocumentCanBePosted(input, transaction);

    const policySnapshotId = await this.postingRuleSnapshotService.findApplicableRuleId(
      input,
      transaction,
    );

    const { document, journal } = await this.recorder.record(
      input,
      { approval, policySnapshotId },
      user,
      transaction,
    );

    this.logger.info('Borrador contable creado.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'createDraftInTransaction',
      documentId: document.id,
      journalId: journal.id,
      lineCount: input.lines.length,
    });
    return this.queries.getDocument(document.id, transaction);
  }

  async createDraftBulk(input: BulkCreateAccountingDocumentsDto, user: AuthUser) {
    this.logger.info('Inicio de creación bulk de borradores contables.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'createDraftBulk',
      itemCount: input.items.length,
      batchExternalId: input.batchExternalId ?? null,
      userId: user.sub,
    });

    return this.sequelize.transaction(async (transaction) => {
      const createdDocuments = [];
      let createdJournalLines = 0;

      for (const item of input.items) {
        const created = await this.createDraftInTransaction(item, user, transaction);
        createdDocuments.push(created.document);
        createdJournalLines += created.lines.length;
      }

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'GENERAL_LEDGER_POSTING_PREPARATION',
        actionCode: 'BULK_CREATE_ACCOUNTING_DRAFTS_WITH_JOURNALS',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'ACCOUNTING_DOCUMENT_BATCH',
        aggregateId: input.batchExternalId ?? null,
        correlationId: input.batchExternalId ?? null,
        affectedTables: [
          'atlas_accounting.accounting_document',
          'atlas_accounting.journal_entry',
          'atlas_accounting.journal_entry_line',
          'atlas_accounting.document_audit_log',
          'atlas_accounting.event_outbox',
        ],
        affectedRecordCount: createdDocuments.length * 4 + createdJournalLines,
        status: 'SUCCESS',
        inputSummary: { requestedItems: input.items.length },
        outputSummary: {
          createdDocuments: createdDocuments.length,
          createdJournalLines,
        },
        transaction,
      });

      return {
        batchExternalId: input.batchExternalId ?? null,
        totalRequested: input.items.length,
        totalCreated: createdDocuments.length,
        documents: createdDocuments,
      };
    });
  }
}
