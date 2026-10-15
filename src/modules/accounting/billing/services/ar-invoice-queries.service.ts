import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, type WhereOptions } from 'sequelize';
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
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';

/** Lecturas de eventos facturables y facturas AR, acotadas a las entidades del token. */
@Injectable()
export class ArInvoiceQueries {
  constructor(
    private readonly legalEntityAccessService: LegalEntityAccessService,
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
}
