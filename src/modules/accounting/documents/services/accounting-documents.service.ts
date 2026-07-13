import { createHash } from 'crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AccountingDocumentModel,
  DocumentAuditLogModel,
  EventOutboxModel,
  JournalEntryLineModel,
  JournalEntryModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  BulkCreateAccountingDocumentsDto,
  CreateAccountingDocumentDto,
  ReverseAccountingDocumentDto,
} from '../../shared/schemas/accounting.schemas';
import { DoubleEntryValidator } from '../../posting/validators/double-entry.validator';
import { PeriodGuardService } from '../../posting/services/period-guard.service';
import { SapPostingValidationService } from '../../posting/services/sap-posting-validation.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PostingRuleSnapshotService } from '../../posting/services/posting-rule-snapshot.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';

@Injectable()
export class AccountingDocumentsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly doubleEntryValidator: DoubleEntryValidator,
    private readonly periodGuardService: PeriodGuardService,
    private readonly sapPostingValidationService: SapPostingValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly postingRuleSnapshotService: PostingRuleSnapshotService,
    private readonly logger: PinoLoggerService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    @InjectModel(AccountingDocumentModel)
    private readonly accountingDocumentModel: typeof AccountingDocumentModel,
    @InjectModel(JournalEntryModel) private readonly journalEntryModel: typeof JournalEntryModel,
    @InjectModel(JournalEntryLineModel)
    private readonly journalEntryLineModel: typeof JournalEntryLineModel,
    @InjectModel(DocumentAuditLogModel)
    private readonly auditLogModel: typeof DocumentAuditLogModel,
    @InjectModel(EventOutboxModel) private readonly eventOutboxModel: typeof EventOutboxModel,
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

  async createDraftInTransaction(
    input: CreateAccountingDocumentDto,
    user: AuthUser,
    transaction: Transaction,
  ) {
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, input.legalEntityId);
    this.doubleEntryValidator.validate(input.lines);
    await this.sapPostingValidationService.assertDocumentCanBePosted(input, transaction);

    const policySnapshotId = await this.postingRuleSnapshotService.findApplicableRuleId(
      input,
      transaction,
    );

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
        approvalStatus: input.approvalStatus,
        policySnapshotId,
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
        debit: line.debit,
        credit: line.credit,
        currencyCode: line.currencyCode,
        amountLc: line.amountLc || Math.max(line.debit, line.credit),
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
        eventPayload: { documentNo: input.documentNo, lineCount: input.lines.length },
        actorId: user.sub,
      },
      { transaction },
    );

    await this.eventOutboxModel.create(
      {
        topic: 'accounting.document.draft_created',
        aggregateType: 'accounting_document',
        aggregateId: document.id,
        eventKey: `accounting-document-draft-${document.id}`,
        payload: { accountingDocumentId: document.id, documentNo: input.documentNo },
      },
      { transaction },
    );

    await this.businessActionLogsService.record({
      moduleCode: 'ACCOUNTING',
      businessProcess: 'GENERAL_LEDGER_POSTING_PREPARATION',
      actionCode: 'CREATE_ACCOUNTING_DRAFT_WITH_JOURNAL',
      actorUserId: user.sub,
      actorRole: user.role ?? null,
      aggregateType: 'ACCOUNTING_DOCUMENT',
      aggregateId: document.id,
      affectedTables: [
        'atlas_accounting.accounting_document',
        'atlas_accounting.journal_entry',
        'atlas_accounting.journal_entry_line',
        'atlas_accounting.document_audit_log',
        'atlas_accounting.event_outbox',
      ],
      affectedRecordCount: 4 + input.lines.length,
      status: 'SUCCESS',
      inputSummary: { documentNo: input.documentNo, lineCount: input.lines.length },
      outputSummary: { documentId: document.id, journalId: journal.id },
      transaction,
    });

    this.logger.info('Borrador contable creado.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'createDraftInTransaction',
      documentId: document.id,
      journalId: journal.id,
      lineCount: input.lines.length,
    });
    return this.getDocument(document.id, transaction);
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

  async postDocument(id: string, user: AuthUser) {
    this.logger.info('Inicio de publicación de documento contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'postDocument',
      accountingDocumentId: id,
      userId: user.sub,
    });
    return this.sequelize.transaction((transaction) =>
      this.postDocumentInTransaction(id, user, transaction),
    );
  }

  async postDocumentInTransaction(id: string, user: AuthUser, transaction: Transaction) {
    const document = await this.accountingDocumentModel.findByPk(id, { transaction });

    if (!document) {
      throw new NotFoundException({
        code: 'ACCOUNTING_DOCUMENT_NOT_FOUND',
        message: 'El documento contable no existe.',
      });
    }

    this.legalEntityAccessService.assertCanAccessLegalEntity(user, document.legalEntityId);

    if (document.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'ACCOUNTING_DOCUMENT_NOT_DRAFT',
        message: 'Solo se pueden publicar documentos en estado DRAFT.',
      });
    }

    await this.periodGuardService.assertPeriodIsOpen(document.accountingPeriodId, transaction);

    const journal = await this.journalEntryModel.findOne({
      where: { accountingDocumentId: id },
      ...(transaction ? { transaction } : {}),
    });

    if (!journal) {
      throw new ConflictException({
        code: 'JOURNAL_ENTRY_NOT_FOUND',
        message: 'El documento no tiene asiento asociado.',
      });
    }

    const lines = await this.journalEntryLineModel.findAll({
      where: { journalEntryId: journal.id },
      transaction,
      order: [['lineNo', 'ASC']],
    });

    this.doubleEntryValidator.validate(
      lines.map((line) => ({ debit: Number(line.debit), credit: Number(line.credit) })),
    );

    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          documentId: document.id,
          journalId: journal.id,
          lines: lines.map((line) => ({
            lineNo: line.lineNo,
            glAccountId: line.glAccountId,
            debit: line.debit,
            credit: line.credit,
          })),
        }),
      )
      .digest('hex');

    await document.update({ status: 'POSTED' }, { transaction });
    await journal.update(
      {
        postingStatus: 'POSTED',
        postedAt: new Date(),
        postedBy: user.sub,
        hashSha256: hash,
      },
      { transaction },
    );

    await this.auditLogModel.create(
      {
        accountingDocumentId: id,
        eventType: 'POSTED',
        eventPayload: { hashSha256: hash },
        actorId: user.sub,
      },
      { transaction },
    );

    await this.eventOutboxModel.create(
      {
        topic: 'accounting.document.posted',
        aggregateType: 'accounting_document',
        aggregateId: id,
        eventKey: `accounting-document-posted-${id}`,
        payload: { accountingDocumentId: id, hashSha256: hash },
      },
      { transaction },
    );

    this.logger.info('Documento contable publicado.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'postDocumentInTransaction',
      accountingDocumentId: id,
      journalId: journal.id,
      hashSha256: hash,
    });
    return this.getDocument(id, transaction);
  }

  async reverseDocument(id: string, input: ReverseAccountingDocumentDto, user: AuthUser) {
    this.logger.info('Inicio de reverso contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'reverseDocument',
      accountingDocumentId: id,
      reversalDocumentNo: input.reversalDocumentNo,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const original = await this.accountingDocumentModel.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!original) {
        throw new NotFoundException({
          code: 'ACCOUNTING_DOCUMENT_NOT_FOUND',
          message: 'El documento contable no existe.',
        });
      }

      this.legalEntityAccessService.assertCanAccessLegalEntity(user, original.legalEntityId);

      if (original.status !== 'POSTED') {
        throw new ConflictException({
          code: 'ACCOUNTING_DOCUMENT_NOT_POSTED',
          message: 'Solo se pueden reversar documentos publicados.',
        });
      }

      const existingReversal = await this.accountingDocumentModel.findOne({
        where: {
          reversalOfId: original.id,
          status: { [Op.ne]: 'VOID' },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (existingReversal) {
        throw new ConflictException({
          code: 'ACCOUNTING_DOCUMENT_ALREADY_REVERSED',
          message:
            'El documento contable ya tiene un reverso activo y no puede reversarse dos veces.',
        });
      }

      const originalJournal = await this.journalEntryModel.findOne({
        where: { accountingDocumentId: original.id },
        transaction,
      });

      if (!originalJournal) {
        throw new ConflictException({
          code: 'JOURNAL_ENTRY_NOT_FOUND',
          message: 'El documento original no tiene asiento asociado.',
        });
      }

      const originalLines = await this.journalEntryLineModel.findAll({
        where: { journalEntryId: originalJournal.id },
        transaction,
        order: [['lineNo', 'ASC']],
      });

      const reversal = await this.createDraftInTransaction(
        {
          legalEntityId: original.legalEntityId,
          sourceSystem: 'ACCOUNTING',
          sourceType: 'REVERSAL',
          sourceId: `${original.id}:${input.reversalDocumentNo}`,
          documentType: 'REVERSAL',
          documentNo: input.reversalDocumentNo,
          documentDate: input.reversalDate,
          postingDate: input.reversalDate,
          accountingPeriodId: input.accountingPeriodId,
          ledgerId: original.ledgerId,
          currencyCode: original.currencyCode,
          approvalStatus: 'NOT_REQUIRED',
          lines: originalLines.map((line) => ({
            glAccountId: line.glAccountId,
            debit: Number(line.credit),
            credit: Number(line.debit),
            currencyCode: line.currencyCode,
            amountLc: Number(line.amountLc),
            partnerId: line.partnerId ?? undefined,
            costCenterId: line.costCenterId ?? undefined,
            profitCenterId: line.profitCenterId ?? undefined,
            taxCodeId: line.taxCodeId ?? undefined,
            referenceType: 'REVERSAL',
            referenceId: original.id,
            description: `Reverso: ${input.reason}`,
          })),
        },
        user,
        transaction,
      );

      await reversal.document.update({ reversalOfId: original.id }, { transaction });
      const postedReversal = await this.postDocumentInTransaction(
        reversal.document.id,
        user,
        transaction,
      );

      await original.update(
        {
          status: 'REVERSED',
          reversedById: postedReversal.document.id,
        },
        { transaction },
      );
      await originalJournal.update({ postingStatus: 'REVERSED' }, { transaction });

      await this.auditLogModel.create(
        {
          accountingDocumentId: original.id,
          eventType: 'REVERSED',
          eventPayload: { reversedById: postedReversal.document.id, reason: input.reason },
          actorId: user.sub,
        },
        { transaction },
      );

      await this.eventOutboxModel.create(
        {
          topic: 'accounting.document.reversed',
          aggregateType: 'accounting_document',
          aggregateId: original.id,
          eventKey: `accounting-document-reversed-${original.id}`,
          payload: { accountingDocumentId: original.id, reversedById: postedReversal.document.id },
        },
        { transaction },
      );

      this.logger.info('Reverso contable publicado y documento original marcado como REVERSED.', {
        layer: 'service',
        module: 'accounting-documents',
        action: 'reverseDocument',
        originalDocumentId: original.id,
        reversalDocumentId: postedReversal.document.id,
      });
      return postedReversal;
    });
  }

  async list(user: AuthUser) {
    const rows = await this.accountingDocumentModel.findAll({
      order: [['documentDate', 'DESC']],
      limit: 500,
    });
    const items = rows.filter((row) => {
      try {
        this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
        return true;
      } catch {
        return false;
      }
    });
    return { items, total: items.length };
  }

  async getDocument(id: string, transaction?: Transaction) {
    this.logger.debug('Consulta de documento contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'getDocument',
      accountingDocumentId: id,
      insideTransaction: Boolean(transaction),
    });
    const findOptions = transaction ? { transaction } : undefined;
    const document = await this.accountingDocumentModel.findByPk(id, findOptions);

    if (!document) {
      throw new NotFoundException({
        code: 'ACCOUNTING_DOCUMENT_NOT_FOUND',
        message: 'El documento contable no existe.',
      });
    }

    const journal = await this.journalEntryModel.findOne({
      where: { accountingDocumentId: id },
      ...(transaction ? { transaction } : {}),
    });

    const lines = journal
      ? await this.journalEntryLineModel.findAll({
          where: { journalEntryId: journal.id },
          ...(transaction ? { transaction } : {}),
          order: [['lineNo', 'ASC']],
        })
      : [];

    return { document, journal, lines };
  }
}
