import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { Op } from 'sequelize';
import { ElectronicTaxDocumentModel } from '../../database/models';
import { MerchantInvoiceModel } from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { FiscalPdfService } from '../fiscal/siat/application/fiscal-pdf.service';
import type { GeneratedPdf } from '../documents/documents.service';
import { PortalScopeService, type PortalScope } from './portal.scope.service';

/** Estados en los que el documento fiscal ES la factura (el comercio puede descargarla). */
const ESTADOS_DESCARGABLES = ['ACCEPTED', 'OBSERVED', 'OFFLINE', 'PACKAGED', 'VOIDED'];

/**
 * La factura fiscal vista por el comercio: resumen, PDF (representación gráfica) y XML, que el
 * SIN obliga a entregar al comprador. Sólo de facturas de SUS cuentas (`PortalScopeService`).
 */
@Injectable()
export class PortalFiscalService {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly fiscalPdf: FiscalPdfService,
    @InjectModel(MerchantInvoiceModel) private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
  ) {}

  /** El documento fiscal vigente de una factura del comercio, o `null` si no tiene. */
  async resumen(scope: PortalScope, invoiceId: string, requestedAccountId?: string) {
    const documento = await this.documento(scope, invoiceId, requestedAccountId);
    return documento
      ? {
          numeroFactura: documento.numeroFactura,
          cuf: documento.cuf,
          siatStatus: documento.siatStatus,
          fechaEmision: documento.fechaEmision,
          descargable: ESTADOS_DESCARGABLES.includes(documento.siatStatus),
        }
      : null;
  }

  async pdf(
    scope: PortalScope,
    invoiceId: string,
    requestedAccountId?: string,
  ): Promise<GeneratedPdf> {
    return this.fiscalPdf.pdf(await this.descargable(scope, invoiceId, requestedAccountId));
  }

  async xml(scope: PortalScope, invoiceId: string, requestedAccountId?: string) {
    const documento = await this.descargable(scope, invoiceId, requestedAccountId);
    return {
      xml: gunzipSync(documento.xmlGzip!),
      filename: `factura-${documento.numeroFactura ?? documento.id}.xml`,
    };
  }

  private async documento(scope: PortalScope, invoiceId: string, requestedAccountId?: string) {
    const accountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const factura = await this.invoiceModel.findOne({ where: { id: invoiceId, accountId } });
    if (!factura)
      throw new NotFoundException('La factura no existe o no pertenece a este comercio.');
    return this.documentModel.findOne({
      where: {
        sourceType: 'MERCHANT_INVOICE',
        sourceId: factura.id,
        siatStatus: { [Op.notIn]: ['REJECTED'] },
      },
      order: [['createdAt', 'DESC']],
    });
  }

  private async descargable(scope: PortalScope, invoiceId: string, requestedAccountId?: string) {
    const documento = await this.documento(scope, invoiceId, requestedAccountId);
    if (!documento || !ESTADOS_DESCARGABLES.includes(documento.siatStatus) || !documento.xmlGzip) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_NOT_AVAILABLE',
        message: 'Esta factura todavía no tiene una factura fiscal para descargar.',
      });
    }
    return documento;
  }
}
