import { Injectable } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { nextDocumentNumber } from '../../../../common/numbering/document-numbering';
import { AccountingDefaultsService } from '../../shared/services/accounting-defaults.service';
import { AccountingDraftInput, ResolvedAccountingDocument } from '../domain/accounting-draft';

/** Completa lo que el sistema ya sabe de un borrador: su número, su período y su libro. */
@Injectable()
export class DocumentDraftResolver {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly accountingDefaultsService: AccountingDefaultsService,
  ) {}

  /**
   * El número del documento, asignado por el backend.
   *
   * La serie es por entidad legal —así la declara única la tabla—. Los flujos internos (factura,
   * recibo, puente del CRM) siguen mandando su propio número derivado (`AR-…`, `RCPT-…`,
   * `MINV-…`) y no pasan por aquí.
   */
  allocateDocumentNumber(
    legalEntityId: string,
    documentDate: Date,
    transaction: Transaction,
  ): Promise<string> {
    return nextDocumentNumber(
      this.sequelize,
      {
        prefix: 'DOC',
        table: 'atlas_accounting.accounting_document',
        column: 'document_no',
        date: documentDate,
        scope: { column: 'legal_entity_id', value: legalEntityId },
      },
      transaction,
    );
  }

  async withDocumentNumber(
    input: AccountingDraftInput,
    transaction: Transaction,
  ): Promise<AccountingDraftInput & { documentNo: string }> {
    if (input.documentNo) return { ...input, documentNo: input.documentNo };
    const documentNo = await this.allocateDocumentNumber(
      input.legalEntityId,
      input.documentDate,
      transaction,
    );
    return { ...input, documentNo };
  }

  /**
   * El período y el libro, deducidos cuando no vienen.
   *
   * El período lo determina la FECHA de contabilización y el libro la entidad legal: no son una
   * decisión de quien registra el asiento, y ofrecerlos en dos desplegables con todos los
   * períodos y libros de todas las empresas era invitar a contabilizar contra el período de otra.
   * Lo explícito sigue mandando, así que ningún integrador se entera del cambio.
   */
  async withResolvedDefaults(
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
}
