import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  type EmisionPreparada,
  SiatEmissionService,
  TIPO_DOCUMENTO_NIT,
} from '../../../fiscal/siat/application/siat-emission.service';
import {
  ArInvoiceLineModel,
  ArInvoiceModel,
  BillingEventModel,
  BusinessPartnerModel,
  ContractHeaderModel,
  ElectronicTaxDocumentModel,
  LegalEntityModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateAccountingDocumentDto,
  CreateBillingEventDto,
  IssueArInvoiceDto,
} from '../../shared/schemas/accounting.schemas';
import { AccountingDefaultsService } from '../../shared/services/accounting-defaults.service';
import { AccountingDocumentsService } from '../../documents/services/accounting-documents.service';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { BusinessPartnerRoleValidationService } from '../../business-partners/services/business-partner-role-validation.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { nextDocumentNumber } from '../../../../common/numbering/document-numbering';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';

/**
 * La factura con lo que el sistema ya sabía resuelto.
 *
 * Es el mismo DTO con cuatro identificadores dejados de pedir a quien factura: la cuenta de
 * control del cliente, el período, el libro y —cuando hay impuesto— el código tributario con su
 * cuenta de pasivo. A partir de aquí el resto del servicio trabaja igual que antes.
 */
type ResolvedArInvoice = IssueArInvoiceDto & {
  arAccountId: string;
  accountingPeriodId: string;
  ledgerId: string;
};

/**
 * Gestiona eventos facturables y emisión AR manteniendo separadas factura comercial,
 * documento fiscal electrónico y documento contable.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly accountingDocumentsService: AccountingDocumentsService,
    private readonly accountingDefaultsService: AccountingDefaultsService,
    private readonly businessPartnerRoleValidationService: BusinessPartnerRoleValidationService,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(BillingEventModel) private readonly billingEventModel: typeof BillingEventModel,
    @InjectModel(ArInvoiceModel) private readonly arInvoiceModel: typeof ArInvoiceModel,
    @InjectModel(ArInvoiceLineModel) private readonly arInvoiceLineModel: typeof ArInvoiceLineModel,
    @InjectModel(ContractHeaderModel)
    private readonly contractHeaderModel: typeof ContractHeaderModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly electronicTaxDocumentModel: typeof ElectronicTaxDocumentModel,
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
    @InjectModel(LegalEntityModel) private readonly legalEntityModel: typeof LegalEntityModel,
    private readonly businessActionLogsService: BusinessActionLogsService,
    /*
     * Facturación electrónica. Opcional y por forwardRef: el módulo fiscal depende de contabilidad
     * (reverso del asiento al anular) y contabilidad de él (documento fiscal de la factura AR).
     */
    @Optional()
    @Inject(forwardRef(() => SiatEmissionService))
    private readonly fiscal?: SiatEmissionService,
  ) {}

  /**
   * Listado de eventos de facturación (para poblar el select del frontend).
   *
   * Un evento es de la entidad legal de su contrato. Se devolvían los de todas: el contable de A
   * veía importes y referencias facturables de B (P-13). ADMIN sigue viendo todos.
   */
  async listEvents(user: AuthUser) {
    const allowed = this.legalEntityAccessService.accessibleLegalEntityIds(user);
    let where: WhereOptions = {};
    if (allowed !== null) {
      const contracts = await this.contractHeaderModel.findAll({
        attributes: ['id'],
        where: { legalEntityId: { [Op.in]: [...allowed] } } as WhereOptions,
      });
      where = { contractId: { [Op.in]: contracts.map((contract) => contract.id) } } as WhereOptions;
    }
    return this.billingEventModel.findAll({ where, order: [['eventTime', 'DESC']], limit: 200 });
  }

  async listInvoices(user: AuthUser) {
    const rows = await this.arInvoiceModel.findAll({ order: [['createdAt', 'DESC']] });
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

  /**
   * Una factura AR con lo que hace falta para imprimirla.
   *
   * El listado devuelve la cabecera y nada más; el documento necesita las líneas, el cliente, la
   * entidad que emite y —si lo hay— el documento fiscal electrónico. Sin esto, «descargar la
   * factura» sólo podía imprimir la fila de la tabla.
   */
  async getInvoice(id: string, user: AuthUser) {
    const invoice = await this.arInvoiceModel.findByPk(id);
    if (!invoice)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, invoice.legalEntityId);

    const [lines, customer, legalEntity, taxDocument] = await Promise.all([
      this.arInvoiceLineModel.findAll({
        where: { arInvoiceId: invoice.id },
        order: [['lineNo', 'ASC']],
      }),
      this.businessPartnerModel.findByPk(invoice.customerBpId),
      this.legalEntityModel.findByPk(invoice.legalEntityId),
      this.electronicTaxDocumentModel.findOne({ where: { arInvoiceId: invoice.id } }),
    ]);

    return {
      invoice,
      lines,
      customer: customer
        ? {
            id: customer.id,
            partnerNo: customer.partnerNo,
            legalName: customer.legalName,
            tradeName: customer.tradeName,
            taxId: customer.taxId,
            countryCode: customer.countryCode,
          }
        : null,
      legalEntity: legalEntity
        ? {
            id: legalEntity.id,
            code: legalEntity.code,
            legalName: legalEntity.legalName,
            taxId: legalEntity.taxId,
            countryCode: legalEntity.countryCode,
          }
        : null,
      electronicTaxDocument: taxDocument,
    };
  }

  async updateInvoice(id: string, input: Record<string, unknown>, user: AuthUser) {
    const row = await this.arInvoiceModel.findByPk(id);
    if (!row)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    /*
     * `invoiceNo` NO está: el correlativo lo asigna el sistema al emitir y renumerar una factura
     * ya emitida rompe la serie —deja un hueco donde estaba y un duplicado donde va—.
     */
    const allowed = ['invoiceDate', 'dueDate', 'status'];
    await row.update(
      Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))),
    );
    return row;
  }

  /**
   * Sólo se borra una factura que no dejó rastro contable: en borrador, sin asiento, sin cobros y
   * sin documento fiscal. Antes se borraba cualquiera: el asiento publicado seguía en el mayor, los
   * recibos quedaban aplicados a una factura inexistente y nada se recalculaba. Una factura
   * contabilizada no se borra: se anula (ante Impuestos, si tiene documento fiscal) o se reversa su
   * asiento (`POST /accounting/documents/:id/reverse`).
   */
  async deleteInvoice(id: string, user: AuthUser) {
    const row = await this.arInvoiceModel.findByPk(id);
    if (!row)
      throw new NotFoundException({
        code: 'AR_INVOICE_NOT_FOUND',
        message: 'La factura no existe.',
      });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, row.legalEntityId);
    return this.sequelize.transaction(async (transaction) => {
      const [rastro] = await this.sequelize.query<{ cobros: string; fiscal: string }>(
        `SELECT
           (SELECT count(*) FROM atlas_accounting.receipt_allocation WHERE ar_invoice_id = :id)::text AS cobros,
           (SELECT count(*) FROM atlas_accounting.electronic_tax_document WHERE ar_invoice_id = :id)::text AS fiscal`,
        { replacements: { id }, type: QueryTypes.SELECT, transaction },
      );
      const motivos = [
        ...(row.status !== 'DRAFT' ? [`STATUS_${row.status}`] : []),
        ...(row.accountingDocumentId ? ['HAS_ACCOUNTING_DOCUMENT'] : []),
        ...(Number(rastro?.cobros ?? 0) > 0 ? ['HAS_RECEIPT_ALLOCATIONS'] : []),
        ...(Number(rastro?.fiscal ?? 0) > 0 ? ['HAS_FISCAL_DOCUMENT'] : []),
      ];
      if (motivos.length > 0) {
        throw new ConflictException({
          code: 'AR_INVOICE_HAS_ACCOUNTING_TRACE',
          message:
            'Una factura contabilizada no se borra: se anula (ante Impuestos, si tiene documento fiscal) o se reversa su asiento.',
          details: { reasons: motivos, accountingDocumentId: row.accountingDocumentId ?? null },
        });
      }
      await this.arInvoiceLineModel.destroy({ where: { arInvoiceId: id }, transaction });
      await row.destroy({ transaction });
      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'ACCOUNTS_RECEIVABLE',
        actionCode: 'DELETE_DRAFT_AR_INVOICE',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'AR_INVOICE',
        aggregateId: id,
        affectedTables: ['atlas_accounting.ar_invoice', 'atlas_accounting.ar_invoice_line'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { invoiceNo: row.invoiceNo, legalEntityId: row.legalEntityId },
        transaction,
      });
      return { id, deleted: true };
    });
  }

  createBillingEvent(input: CreateBillingEventDto, user: AuthUser) {
    this.logger.info('Registrando evento facturable.', {
      layer: 'service',
      module: 'billing',
      action: 'createBillingEvent',
      contractId: input.contractId,
      eventType: input.eventType,
      externalRef: input.externalRef,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado al evento facturable no existe.',
        });
      }
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
      const event = await this.billingEventModel.create(
        { ...input, status: 'RECORDED' },
        { transaction },
      );
      this.logger.info('Evento facturable registrado.', {
        layer: 'service',
        module: 'billing',
        action: 'createBillingEvent',
        billingEventId: event.id,
        contractId: input.contractId,
      });
      return event;
    });
  }

  /**
   * FND-ERPB-09 / WP14-ERPB P1-2: el estado fiscal (CUF, CUFD, hash del XML, «aceptada») sólo lo
   * puede dar Impuestos Nacionales, y el ERP lo escribe a partir de lo que responde el SIN. Un
   * cliente que lo afirma en el cuerpo se rechaza SIEMPRE, también con `SIAT_MODE=disabled`: antes,
   * en ese modo —el defecto— se persistía tal cual, y una factura podía figurar `ACCEPTED` con un
   * CUF inventado sin haber pasado nunca por el SIN. Se comprueba antes de tocar la base.
   */
  private rechazarEstadoFiscalAfirmado(input: IssueArInvoiceDto): void {
    if (input.electronicTaxDocument) {
      throw new UnprocessableEntityException({
        code: 'FISCAL_STATUS_NOT_CLIENT_ASSERTED',
        message:
          'El estado fiscal de una factura lo da Impuestos Nacionales a través del ERP; no se envía en la petición.',
      });
    }
  }

  async issueInvoice(rawInput: IssueArInvoiceDto, user: AuthUser) {
    this.rechazarEstadoFiscalAfirmado(rawInput);
    this.logger.info('Emitiendo factura AR.', {
      layer: 'service',
      module: 'billing',
      action: 'issueInvoice',
      legalEntityId: rawInput.legalEntityId,
      customerBpId: rawInput.customerBpId,
      userId: user.sub,
    });
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
    const fiscal = await this.prepararEmisionFiscal(rawInput);
    return this.sequelize.transaction(async (transaction) => {
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, rawInput.legalEntityId);
      const input = await this.resolveInvoiceDefaults(rawInput, transaction);
      await this.assertInvoiceInputsAreSapSafe(input, transaction);
      const grossAmount = Number(input.netAmount) + Number(input.taxAmount);

      // La serie es por entidad legal, que es como la tiene declarada única la propia tabla.
      const invoiceNo = await nextDocumentNumber(
        this.sequelize,
        {
          prefix: 'FAC-AR',
          table: 'atlas_accounting.ar_invoice',
          column: 'invoice_no',
          date: input.invoiceDate,
          scope: { column: 'legal_entity_id', value: input.legalEntityId },
        },
        transaction,
      );

      const invoice = await this.arInvoiceModel.create(
        {
          legalEntityId: input.legalEntityId,
          customerBpId: input.customerBpId,
          contractId: input.contractId,
          invoiceNo,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          currencyCode: input.currencyCode,
          netAmount: input.netAmount,
          taxAmount: input.taxAmount,
          grossAmount,
          status: 'ISSUED',
        },
        { transaction },
      );

      await this.arInvoiceLineModel.create(
        {
          arInvoiceId: invoice.id,
          lineNo: 1,
          billingEventId: input.billingEventId,
          revenueAccountId: input.revenueAccountId,
          taxCodeId: input.taxCodeId,
          description: input.description,
          qty: 1,
          unitPrice: input.netAmount,
          lineAmount: input.netAmount,
        },
        { transaction },
      );

      const fiscalDocument = fiscal
        ? await this.emitirDocumentoFiscal(
            fiscal,
            invoice,
            input.description,
            grossAmount,
            transaction,
          )
        : null;

      const journalLines = this.buildInvoiceJournalLines(input, grossAmount, invoice.id, invoiceNo);
      const accounting = await this.accountingDocumentsService.createDraftInTransaction(
        {
          legalEntityId: input.legalEntityId,
          sourceSystem: 'BILLING',
          sourceType: 'AR_INVOICE',
          sourceId: invoice.id,
          documentType: 'AR_INVOICE',
          documentNo: `AR-${invoiceNo}`,
          documentDate: input.invoiceDate,
          postingDate: input.invoiceDate,
          accountingPeriodId: input.accountingPeriodId,
          ledgerId: input.ledgerId,
          currencyCode: input.currencyCode,
          approvalStatus: 'NOT_REQUIRED',
          lines: journalLines,
        },
        user,
        transaction,
      );

      await this.accountingDocumentsService.postDocumentInTransaction(
        accounting.document.id,
        user,
        transaction,
      );
      await invoice.update({ accountingDocumentId: accounting.document.id }, { transaction });

      await this.businessActionLogsService.record({
        moduleCode: 'ACCOUNTING',
        businessProcess: 'ACCOUNTS_RECEIVABLE',
        actionCode: 'ISSUE_AR_INVOICE',
        actorUserId: user.sub,
        actorRole: user.role ?? null,
        aggregateType: 'AR_INVOICE',
        aggregateId: invoice.id,
        affectedTables: [
          'atlas_accounting.ar_invoice',
          'atlas_accounting.ar_invoice_line',
          'atlas_accounting.accounting_document',
        ],
        affectedRecordCount: 3,
        status: 'SUCCESS',
        inputSummary: { legalEntityId: input.legalEntityId, grossAmount: String(grossAmount) },
        outputSummary: {
          invoiceNo: invoice.invoiceNo,
          accountingDocumentId: accounting.document.id,
          fiscalDocument: fiscalDocument !== null,
        },
        transaction,
      });

      this.logger.info('Factura AR emitida y contabilizada.', {
        layer: 'service',
        module: 'billing',
        action: 'issueInvoice',
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        accountingDocumentId: accounting.document.id,
      });
      return { invoice, accountingDocumentId: accounting.document.id, fiscalDocument };
    });
  }

  /**
   * Antes de la transacción: con SIAT activo se decide emisor, CUFD y en línea / fuera de línea, y
   * la factura tiene que llevar la fecha en que se emite (la de `fechaEmision`).
   */
  private async prepararEmisionFiscal(input: IssueArInvoiceDto): Promise<EmisionPreparada | null> {
    if (!this.fiscal?.activo) return null;
    const cliente = await this.businessPartnerModel.findByPk(input.customerBpId);
    const preparada = await this.fiscal.preparar(
      input.legalEntityId,
      cliente?.taxId
        ? {
            codigoTipoDocumentoIdentidad: cliente.taxDocumentType ?? TIPO_DOCUMENTO_NIT,
            numeroDocumento: cliente.taxId,
          }
        : undefined,
    );
    if (!preparada) return null;
    const hoy = this.fiscal.fechaDeEmisionHoy(preparada);
    if (new Date(input.invoiceDate).toISOString().slice(0, 10) !== hoy) {
      throw new UnprocessableEntityException({
        code: 'FISCAL_INVOICE_DATE_MUST_BE_TODAY',
        message: `Con facturación electrónica la factura se fecha el día en que se emite (${hoy}).`,
        field: 'invoiceDate',
      });
    }
    if (!preparada.perfil.productoSinDefault) {
      throw new UnprocessableEntityException({
        code: 'FISCAL_PRODUCT_NOT_HOMOLOGATED',
        message:
          'El emisor no tiene «producto del SIN por defecto» para las facturas de contabilidad: configúralo en Facturación electrónica › Emisor.',
      });
    }
    return preparada;
  }

  /** Dentro de la transacción: el documento fiscal de la factura AR, una línea por su importe bruto. */
  private async emitirDocumentoFiscal(
    fiscal: EmisionPreparada,
    invoice: ArInvoiceModel,
    descripcion: string,
    grossAmount: number,
    transaction: Transaction,
  ): Promise<Record<string, unknown>> {
    const cliente = await this.businessPartnerModel.findByPk(invoice.customerBpId, { transaction });
    const total = grossAmount.toFixed(2);
    const documento = await this.fiscal!.emitirEnTransaccion(
      fiscal,
      {
        sourceType: 'AR_INVOICE',
        sourceId: invoice.id,
        receptor: {
          codigoTipoDocumentoIdentidad: cliente?.taxDocumentType ?? TIPO_DOCUMENTO_NIT,
          numeroDocumento: cliente?.taxId ?? '',
          complemento: cliente?.taxIdComplement ?? null,
          nombreRazonSocial: cliente?.legalName ?? '',
          codigoCliente: cliente?.partnerNo ?? invoice.customerBpId,
          correo: cliente?.billingEmail ?? null,
        },
        lineas: [
          {
            codigoProducto: invoice.invoiceNo,
            descripcion,
            cantidad: '1',
            precioUnitario: total,
            codigoProductoSin: Number(fiscal.perfil.productoSinDefault),
            unidadMedida: fiscal.perfil.unidadMedidaDefault ?? 58,
          },
        ],
        totalEsperado: total,
      },
      transaction,
    );
    return {
      id: documento.id,
      siatStatus: documento.siatStatus,
      numeroFactura: documento.numeroFactura,
      cuf: documento.cuf,
    };
  }

  /**
   * Lo que el alta dejó de preguntar.
   *
   * El impuesto sólo se resuelve si lo hay: informar cuenta fiscal en una factura sin impuesto es
   * un error que el propio servicio rechaza más abajo, y deducirla «por si acaso» lo provocaría.
   */
  private async resolveInvoiceDefaults(
    input: IssueArInvoiceDto,
    transaction: Transaction,
  ): Promise<ResolvedArInvoice> {
    const [arAccountId, accountingPeriodId, ledgerId] = await Promise.all([
      this.accountingDefaultsService.resolveArControlAccountId(
        input.legalEntityId,
        input.customerBpId,
        input.arAccountId,
        transaction,
      ),
      this.accountingDefaultsService.resolveOpenPeriodId(
        input.legalEntityId,
        input.invoiceDate,
        input.accountingPeriodId,
        transaction,
      ),
      this.accountingDefaultsService.resolveLedgerId(
        input.legalEntityId,
        input.ledgerId,
        transaction,
      ),
    ]);

    const impuesto =
      Number(input.taxAmount) > 0
        ? await this.accountingDefaultsService.resolveOutputTax(
            input.invoiceDate,
            input.taxCodeId,
            input.taxLiabilityAccountId,
            transaction,
          )
        : null;

    return {
      ...input,
      arAccountId,
      accountingPeriodId,
      ledgerId,
      ...(impuesto
        ? { taxCodeId: impuesto.taxCodeId, taxLiabilityAccountId: impuesto.taxLiabilityAccountId }
        : {}),
    };
  }

  private async assertInvoiceInputsAreSapSafe(
    input: ResolvedArInvoice,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando factura AR con reglas SAP-like.', {
      layer: 'service',
      module: 'billing',
      action: 'assertInvoiceInputsAreSapSafe',
      legalEntityId: input.legalEntityId,
    });
    await this.businessPartnerRoleValidationService.assertHasAnyActiveRole(
      input.customerBpId,
      ['CUSTOMER', 'MERCHANT', 'INTERCOMPANY'],
      input.legalEntityId,
      transaction,
    );

    if (input.contractId) {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado a la factura no existe.',
        });
      }

      if (
        contract.legalEntityId !== input.legalEntityId ||
        contract.counterpartyBpId !== input.customerBpId
      ) {
        throw new ConflictException({
          code: 'INVOICE_CONTRACT_MISMATCH',
          message: 'El contrato no corresponde a la entidad legal o contraparte de la factura.',
        });
      }

      if (!['ACTIVE', 'APPROVED'].includes(contract.status)) {
        throw new ConflictException({
          code: 'CONTRACT_NOT_ACTIVE',
          message: 'El contrato no está activo o aprobado para facturación.',
        });
      }
    }

    if (Number(input.taxAmount) > 0 && (!input.taxLiabilityAccountId || !input.taxCodeId)) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_AND_CODE_REQUIRED',
        message: 'Una factura con impuesto debe informar cuenta fiscal pasiva y código tributario.',
      });
    }

    if (Number(input.taxAmount) === 0 && input.taxLiabilityAccountId) {
      throw new BadRequestException({
        code: 'TAX_ACCOUNT_WITHOUT_TAX_AMOUNT',
        message: 'No informes cuenta fiscal si la factura no tiene impuesto.',
      });
    }
  }

  private buildInvoiceJournalLines(
    input: ResolvedArInvoice,
    grossAmount: number,
    invoiceId: string,
    invoiceNo: string,
  ): CreateAccountingDocumentDto['lines'] {
    this.logger.debug('Construyendo líneas contables de factura AR.', {
      layer: 'service',
      module: 'billing',
      action: 'buildInvoiceJournalLines',
      invoiceNo,
      grossAmount,
    });
    const journalLines: CreateAccountingDocumentDto['lines'] = [
      {
        glAccountId: input.arAccountId,
        debit: grossAmount,
        credit: 0,
        currencyCode: input.currencyCode,
        amountLc: grossAmount,
        partnerId: input.customerBpId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: `CxC factura ${invoiceNo}`,
      },
      {
        glAccountId: input.revenueAccountId,
        debit: 0,
        credit: Number(input.netAmount),
        currencyCode: input.currencyCode,
        amountLc: Number(input.netAmount),
        partnerId: input.customerBpId,
        taxCodeId: input.taxCodeId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: input.description,
      },
    ];

    if (Number(input.taxAmount) > 0 && input.taxLiabilityAccountId) {
      journalLines.push({
        glAccountId: input.taxLiabilityAccountId,
        debit: 0,
        credit: Number(input.taxAmount),
        currencyCode: input.currencyCode,
        amountLc: Number(input.taxAmount),
        partnerId: input.customerBpId,
        taxCodeId: input.taxCodeId,
        referenceType: 'AR_INVOICE',
        referenceId: invoiceId,
        description: `IVA débito factura ${invoiceNo}`,
      });
    }

    return journalLines;
  }
}
