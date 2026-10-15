import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DocumentAuditLogModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { TracingService } from '../../../../common/observability/tracing.service';
import { APP_ATTRIBUTES, SPAN_NAMES } from '../../../../observability/telemetry.constants';
import { DoubleEntryValidator } from '../../posting/validators/double-entry.validator';
import { PeriodGuardService } from '../../posting/services/period-guard.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { assertDocumentApprovedForPosting } from '../domain/document-approval';
import { sealJournal } from '../domain/journal-seal';
import {
  AccountingDocumentQueries,
  assertJournalExists,
} from './accounting-document-queries.service';
import { AccountingEventOutbox } from './accounting-event-outbox.service';

/** Publicación (contabilización) de un documento en borrador. */
@Injectable()
export class AccountingPostingService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly queries: AccountingDocumentQueries,
    private readonly outbox: AccountingEventOutbox,
    private readonly doubleEntryValidator: DoubleEntryValidator,
    private readonly periodGuardService: PeriodGuardService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    private readonly tracing: TracingService,
    @InjectModel(DocumentAuditLogModel)
    private readonly auditLogModel: typeof DocumentAuditLogModel,
  ) {}

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
     * Con el bloqueo, la segunda transacción espera y encuentra `POSTED`, que es exactamente el
     * 409 que el contrato promete.
     */
    const document = await this.queries.lockDocument(id, transaction);

    this.legalEntityAccessService.assertCanAccessLegalEntity(user, document.legalEntityId);

    if (document.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'ACCOUNTING_DOCUMENT_NOT_DRAFT',
        message: 'Solo se pueden publicar documentos en estado DRAFT.',
      });
    }

    /*
     * Un documento que espera aprobación, o al que se la negaron, no se publica: publicar es
     * justamente lo que la aprobación autoriza. Un APPROVED sin aprobador registrado
     * (autocertificado antes de ATL-03) tampoco.
     */
    assertDocumentApprovedForPosting(document);

    await this.periodGuardService.assertPeriodIsOpen(document.accountingPeriodId, transaction);

    const { journal, lines } = await this.queries.loadJournalWithLines(id, transaction);
    assertJournalExists(journal, 'El documento no tiene asiento asociado.');

    this.doubleEntryValidator.validate(
      lines.map((line) => ({ debit: String(line.debit), credit: String(line.credit) })),
    );

    const hash = sealJournal({ documentId: document.id, journalId: journal.id, lines });

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

    await this.outbox.publish(
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
    return this.queries.getDocument(id, transaction);
  }
}
