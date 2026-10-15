import {
  forwardRef,
  Inject,
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import {
  type EmisionPreparada,
  SiatEmissionService,
  TIPO_DOCUMENTO_NIT,
} from '../../../fiscal/siat/application/siat-emission.service';
import { ArInvoiceModel, BusinessPartnerModel } from '../../../../database/models';
import { IssueArInvoiceDto } from '../../shared/schemas/accounting.schemas';

/** El documento fiscal electrónico (SIAT) de una factura AR, cuando la facturación electrónica está activa. */
@Injectable()
export class ArInvoiceFiscalEmission {
  constructor(
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
    /*
     * Facturación electrónica. Opcional y por forwardRef: el módulo fiscal depende de contabilidad
     * (reverso del asiento al anular) y contabilidad de él (documento fiscal de la factura AR).
     */
    @Optional()
    @Inject(forwardRef(() => SiatEmissionService))
    private readonly fiscal?: SiatEmissionService,
  ) {}

  /**
   * Antes de la transacción: con SIAT activo se decide emisor, CUFD y en línea / fuera de línea, y
   * la factura tiene que llevar la fecha en que se emite (la de `fechaEmision`).
   */
  async prepare(input: IssueArInvoiceDto): Promise<EmisionPreparada | null> {
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
  async emit(
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
}
