import { nextDocumentNumber } from '../../../../common/numbering/document-numbering';
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
import { outboxProducerAttributes } from '../../../../common/observability/messaging-attributes';
import { MessagingTraceService } from '../../../../common/observability/messaging-trace.service';
import { TracingService } from '../../../../common/observability/tracing.service';
import { APP_ATTRIBUTES, SPAN_NAMES } from '../../../../observability/telemetry.constants';
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
import { AccountingDefaultsService } from '../../shared/services/accounting-defaults.service';
import { normalizeAmount, toMinorUnits } from '../../../../common/money/decimal-amount.util';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  assertClientApprovalStatus,
  assertDocumentApprovedForPosting,
} from '../domain/document-approval';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';

type JournalLineDto = CreateAccountingDocumentDto['lines'][number];

/**
 * Línea de un borrador tal como la entregan los flujos INTERNOS (puente del CRM, reverso): los
 * importes pueden venir como cadena decimal exacta —tal cual los devuelve una columna `numeric`—
 * en lugar de `number`, para no pasar por coma flotante un importe que ya era exacto (P-07). El
 * contrato HTTP (`journalLineSchema`) sigue siendo `number`, que es un caso particular de éste.
 */
export type DraftJournalLineInput = Omit<JournalLineDto, 'debit' | 'credit' | 'amountLc'> & {
  debit: number | string;
  credit: number | string;
  amountLc?: number | string;
};

export type AccountingDraftInput = Omit<CreateAccountingDocumentDto, 'lines'> & {
  lines: DraftJournalLineInput[];
};

/**
 * El documento con todo lo que el sistema ya sabía resuelto: número, referencia de origen, fecha
 * de contabilización, período y libro.
 */
type ResolvedAccountingDocument = AccountingDraftInput & {
  documentNo: string;
  sourceId: string;
  postingDate: Date;
  accountingPeriodId: string;
  ledgerId: string;
};

/** Tope de página del listado: el mismo 500 que devolvía antes sin parámetros. */
export const DOCUMENT_LIST_MAX_PAGE_SIZE = 500;

@Injectable()
export class AccountingDocumentsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly doubleEntryValidator: DoubleEntryValidator,
    private readonly periodGuardService: PeriodGuardService,
    private readonly sapPostingValidationService: SapPostingValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly postingRuleSnapshotService: PostingRuleSnapshotService,
    private readonly accountingDefaultsService: AccountingDefaultsService,
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
    private readonly messaging: MessagingTraceService,
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
   * El número del documento, asignado por el backend cuando no viene.
   *
   * La serie es por entidad legal —así la declara única la tabla—. Los flujos internos (factura,
   * recibo, puente del CRM) siguen mandando su propio número derivado (`AR-…`, `RCPT-…`,
   * `MINV-…`) y no pasan por aquí.
   */
  /**
   * El período y el libro, deducidos cuando no vienen.
   *
   * El período lo determina la FECHA de contabilización y el libro la entidad legal: no son una
   * decisión de quien registra el asiento, y ofrecerlos en dos desplegables con todos los
   * períodos y libros de todas las empresas era invitar a contabilizar contra el período de otra.
   * Lo explícito sigue mandando, así que ningún integrador se entera del cambio.
   */
  private async withResolvedDefaults(
    input: AccountingDraftInput & { documentNo: string },
    transaction: Transaction,
  ): Promise<ResolvedAccountingDocument> {
    /* En un asiento manual la fecha del documento y la de contabilización son la misma. */
    const postingDate = input.postingDate ?? input.documentDate;
    /* La referencia de origen de un asiento tecleado aquí es su propio número. */
    const sourceId = input.sourceId ?? `${input.sourceType}-${input.documentNo}`;
    const [accountingPeriodId, ledgerId] = await Promise.all([
      this.accountingDefaultsService.resolveOpenPeriodId(
        input.legalEntityId,
        postingDate,
        input.accountingPeriodId,
        transaction,
      ),
      this.accountingDefaultsService.resolveLedgerId(
        input.legalEntityId,
        input.ledgerId,
        transaction,
      ),
    ]);
    return { ...input, sourceId, postingDate, accountingPeriodId, ledgerId };
  }

  private async withDocumentNumber(
    input: AccountingDraftInput,
    transaction: Transaction,
  ): Promise<AccountingDraftInput & { documentNo: string }> {
    if (input.documentNo) return { ...input, documentNo: input.documentNo };
    const documentNo = await nextDocumentNumber(
      this.sequelize,
      {
        prefix: 'DOC',
        table: 'atlas_accounting.accounting_document',
        column: 'document_no',
        date: input.documentDate,
        scope: { column: 'legal_entity_id', value: input.legalEntityId },
      },
      transaction,
    );
    return { ...input, documentNo };
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
  ) {
    return this.tracing.runInSpan(
      SPAN_NAMES.accountingDocumentDraft,
      {
        [APP_ATTRIBUTES.module]: 'accounting',
        [APP_ATTRIBUTES.operation]: 'draft',
        [APP_ATTRIBUTES.entityType]: 'accounting_document',
      },
      () => this.createDraftInSpan(rawInput, user, transaction),
    );
  }

  private async createDraftInSpan(
    rawInput: AccountingDraftInput,
    user: AuthUser,
    transaction: Transaction,
  ) {
    // El alcance se comprueba ANTES de numerar o deducir período y libro: esas lecturas son de la
    // entidad pedida, y hacerlas primero convertía los errores («esta empresa no tiene ejercicio
    // fiscal») en un oráculo sobre entidades ajenas al token. Lo cubre
    // `test/accounting-documents-db.e2e-spec.ts` (403 y ninguna fila escrita).
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
    // APPROVED o REJECTED no los elige quien crea el documento: los decide el servidor (ATL-03).
    assertClientApprovalStatus(rawInput.approvalStatus);
    const numerado = await this.withDocumentNumber(rawInput, transaction);
    const input = await this.withResolvedDefaults(numerado, transaction);
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
        debit: normalizeAmount(line.debit),
        credit: normalizeAmount(line.credit),
        currencyCode: line.currencyCode,
        amountLc: localAmount(line),
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

    await this.publicarEnOutbox(
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

  postDocumentInTransaction(id: string, user: AuthUser, transaction: Transaction) {
    return this.tracing.runInSpan(
      SPAN_NAMES.accountingDocumentPost,
      {
        [APP_ATTRIBUTES.module]: 'accounting',
        [APP_ATTRIBUTES.operation]: 'post',
        [APP_ATTRIBUTES.entityType]: 'accounting_document',
        [APP_ATTRIBUTES.entityId]: id,
      },
      () => this.postDocumentInSpan(id, user, transaction),
    );
  }

  private async postDocumentInSpan(id: string, user: AuthUser, transaction: Transaction) {
    /*
     * `lock: UPDATE` no es una precaución: es lo que hace cierta la comprobación de abajo.
     *
     * Leyendo sin bloquear, bajo el aislamiento por defecto de PostgreSQL (`READ COMMITTED`), dos
     * publicaciones simultáneas del mismo documento leen ambas `DRAFT`, ambas pasan el `!== 'DRAFT'`
     * y ambas escriben `POSTED`: el asiento se contabiliza dos veces y se emiten dos eventos. Un
     * doble clic en la pantalla basta para provocarlo.
     *
     * `reverseDocument`, en este mismo fichero, ya bloqueaba la fila por esta razón; publicar se
     * había quedado fuera. Con el bloqueo, la segunda transacción espera y encuentra `POSTED`, que
     * es exactamente el 409 que el contrato promete.
     */
    const document = await this.accountingDocumentModel.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

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

    /*
     * Un documento que espera aprobación, o al que se la negaron, no se publica: publicar es
     * justamente lo que la aprobación autoriza. Antes se publicaba sin mirar este campo. Un
     * APPROVED sin aprobador registrado (autocertificado antes de ATL-03) tampoco.
     */
    assertDocumentApprovedForPosting(document);

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
      lines.map((line) => ({ debit: String(line.debit), credit: String(line.credit) })),
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

    await this.publicarEnOutbox(
      {
        topic: 'accounting.document.posted',
        aggregateType: 'accounting_document',
        aggregateId: id,
        eventKey: `accounting-document-posted-${id}`,
        payload: { accountingDocumentId: id, hashSha256: hash },
      },
      transaction,
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

      const reversalDocumentNo = await nextDocumentNumber(
        this.sequelize,
        {
          prefix: 'DOC',
          table: 'atlas_accounting.accounting_document',
          column: 'document_no',
          date: input.reversalDate,
          scope: { column: 'legal_entity_id', value: original.legalEntityId },
        },
        transaction,
      );

      const reversal = await this.createDraftInTransaction(
        {
          legalEntityId: original.legalEntityId,
          sourceSystem: 'ACCOUNTING',
          sourceType: 'REVERSAL',
          sourceId: `${original.id}:${reversalDocumentNo}`,
          documentType: 'REVERSAL',
          documentNo: reversalDocumentNo,
          documentDate: input.reversalDate,
          postingDate: input.reversalDate,
          /* Sin período explícito lo deduce `withResolvedDefaults` de la fecha de reversión. */
          ...(input.accountingPeriodId ? { accountingPeriodId: input.accountingPeriodId } : {}),
          ledgerId: original.ledgerId,
          currencyCode: original.currencyCode,
          approvalStatus: 'NOT_REQUIRED',
          lines: originalLines.map((line) => ({
            glAccountId: line.glAccountId,
            debit: String(line.credit),
            credit: String(line.debit),
            currencyCode: line.currencyCode,
            amountLc: String(line.amountLc),
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

      await this.publicarEnOutbox(
        {
          topic: 'accounting.document.reversed',
          aggregateType: 'accounting_document',
          aggregateId: original.id,
          eventKey: `accounting-document-reversed-${original.id}`,
          payload: { accountingDocumentId: original.id, reversedById: postedReversal.document.id },
        },
        transaction,
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

  /**
   * Listado paginado de documentos, filtrado por las entidades del token EN LA CONSULTA (ATL-05).
   *
   * Antes traía los 500 más recientes de TODAS las entidades y filtraba después: un contable de
   * una entidad con pocos documentos no veía los suyos si otra entidad tenía 500 más recientes, y
   * `total` era el tamaño de la ventana. Ahora el WHERE va antes del LIMIT, el orden es estable
   * (fecha DESC, id DESC) y `total` es un COUNT con el mismo filtro. Sin parámetros devuelve la
   * primera página de 500, que es lo que el ERP web espera hoy.
   */
  async list(user: AuthUser, query: { page?: number; pageSize?: number } = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DOCUMENT_LIST_MAX_PAGE_SIZE;
    const allowed = this.legalEntityAccessService.accessibleLegalEntityIds(user);
    if (allowed !== null && allowed.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const where = allowed === null ? {} : { legalEntityId: { [Op.in]: [...allowed] } };
    const { rows, count } = await this.accountingDocumentModel.findAndCountAll({
      where,
      order: [
        ['documentDate', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items: rows, total: count, page, pageSize };
  }

  /**
   * El documento vivo (no anulado) de una clave de origen, en cualquier libro, bloqueado para
   * actualizar. Es lo que permite a un flujo de integración RECUPERAR un documento que un intento
   * anterior creó y no llegó a enlazar, en vez de crear otro (P-06).
   */
  findActiveDocumentBySource(
    source: { sourceSystem: string; sourceType: string; sourceId: string },
    transaction: Transaction,
  ): Promise<AccountingDocumentModel | null> {
    return this.accountingDocumentModel.findOne({
      where: { ...source, status: { [Op.ne]: 'VOID' } },
      order: [['createdAt', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  /**
   * El documento para quien lo pide por HTTP: existe (404 si no) Y es de una entidad legal de su
   * token (403 si no).
   *
   * `getDocument` a secas no mira al usuario —lo usan flujos internos que ya autorizaron la
   * operación dentro de su transacción—, y el controlador lo llamaba directamente: cualquier
   * contable o CFO leía el asiento de otra entidad con sólo conocer su id (P-13).
   */
  async getDocumentForUser(id: string, user: AuthUser) {
    const result = await this.getDocument(id);
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, result.document.legalEntityId);
    return result;
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

  /**
   * Escribe un hecho de dominio en el outbox, dentro de un span PRODUCTOR.
   *
   * El span marca el punto exacto en el que el trabajo deja de ser síncrono, y el portador de
   * traza se inyecta DENTRO de él: así el span consumidor que abra el worker —segundos o minutos
   * después, en otro proceso— cuelga de aquí y la traza queda entera.
   *
   * El portador va en la columna `trace_context` y NO en `payload`: ese campo es el contrato de
   * dominio del evento y lo que saldrá hacia un broker. Ningún atributo del span lleva el
   * contenido del documento; sólo su tipo y su identificador.
   */
  private publicarEnOutbox(
    evento: {
      topic: string;
      aggregateType: string;
      aggregateId: string;
      eventKey: string;
      payload: Record<string, unknown>;
    },
    transaction: Transaction,
  ): Promise<unknown> {
    return this.messaging.runAsProducer(
      SPAN_NAMES.outboxPublish,
      outboxProducerAttributes({
        eventType: evento.topic,
        aggregateType: evento.aggregateType,
        aggregateId: evento.aggregateId,
        producer: 'accounting',
      }),
      () =>
        this.eventOutboxModel.create(
          { ...evento, traceContext: this.messaging.withCarrier(null) },
          { transaction },
        ),
    );
  }
}

/**
 * Importe en moneda local de una línea: el informado, o el mayor de debe/haber (una línea válida
 * tiene uno de los dos en cero). Comparación en unidades menores, nunca con `Math.max` sobre
 * `number`, que ya no distingue céntimos cerca del máximo de `numeric(18,2)`.
 */
function localAmount(line: DraftJournalLineInput): string {
  if (line.amountLc !== undefined && toMinorUnits(line.amountLc) !== 0n) {
    return normalizeAmount(line.amountLc);
  }
  const debit = toMinorUnits(line.debit);
  const credit = toMinorUnits(line.credit);
  return normalizeAmount(String(debit >= credit ? line.debit : line.credit));
}
