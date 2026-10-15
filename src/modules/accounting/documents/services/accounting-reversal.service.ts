import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DocumentAuditLogModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { ReverseAccountingDocumentDto } from '../../shared/schemas/accounting.schemas';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  AccountingDocumentQueries,
  assertJournalExists,
} from './accounting-document-queries.service';
import { AccountingDraftService } from './accounting-draft.service';
import { AccountingEventOutbox } from './accounting-event-outbox.service';
import { AccountingPostingService } from './accounting-posting.service';
import { DocumentDraftResolver } from './document-draft-resolver.service';

/** Reverso de un documento publicado: un documento espejo, publicado, y el original REVERSED. */
@Injectable()
export class AccountingReversalService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly queries: AccountingDocumentQueries,
    private readonly resolver: DocumentDraftResolver,
    private readonly drafts: AccountingDraftService,
    private readonly posting: AccountingPostingService,
    private readonly outbox: AccountingEventOutbox,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(DocumentAuditLogModel)
    private readonly auditLogModel: typeof DocumentAuditLogModel,
  ) {}

  async reverseDocument(id: string, input: ReverseAccountingDocumentDto, user: AuthUser) {
    this.logger.info('Inicio de reverso contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'reverseDocument',
      accountingDocumentId: id,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const original = await this.queries.lockDocument(id, transaction);

      this.legalEntityAccessService.assertCanAccessLegalEntity(user, original.legalEntityId);

      if (original.status !== 'POSTED') {
        throw new ConflictException({
          code: 'ACCOUNTING_DOCUMENT_NOT_POSTED',
          message: 'Solo se pueden reversar documentos publicados.',
        });
      }

      const existingReversal = await this.queries.findActiveReversalOf(original.id, transaction);
      if (existingReversal) {
        throw new ConflictException({
          code: 'ACCOUNTING_DOCUMENT_ALREADY_REVERSED',
          message:
            'El documento contable ya tiene un reverso activo y no puede reversarse dos veces.',
        });
      }

      const { journal: originalJournal, lines: originalLines } =
        await this.queries.loadJournalWithLines(original.id, transaction);
      assertJournalExists(originalJournal, 'El documento original no tiene asiento asociado.');

      const reversalDocumentNo = await this.resolver.allocateDocumentNumber(
        original.legalEntityId,
        input.reversalDate,
        transaction,
      );

      const reversal = await this.drafts.createDraftInTransaction(
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
        { origin: 'SERVER_GENERATED' },
      );

      await reversal.document.update({ reversalOfId: original.id }, { transaction });
      const postedReversal = await this.posting.postDocumentInTransaction(
        reversal.document.id,
        user,
        transaction,
      );

      await original.update(
        { status: 'REVERSED', reversedById: postedReversal.document.id },
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

      await this.outbox.publish(
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
}
