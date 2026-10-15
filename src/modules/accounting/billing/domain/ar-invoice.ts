import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateAccountingDocumentDto,
  IssueArInvoiceDto,
} from '../../shared/schemas/accounting.schemas';

/**
 * La factura con lo que el sistema ya sabía resuelto.
 *
 * Es el mismo DTO con cuatro identificadores dejados de pedir a quien factura: la cuenta de
 * control del cliente, el período, el libro y —cuando hay impuesto— el código tributario con su
 * cuenta de pasivo.
 */
export type ResolvedArInvoice = IssueArInvoiceDto & {
  arAccountId: string;
  accountingPeriodId: string;
  ledgerId: string;
};

/**
 * FND-ERPB-09 / WP14-ERPB P1-2: el estado fiscal (CUF, CUFD, hash del XML, «aceptada») sólo lo
 * puede dar Impuestos Nacionales, y el ERP lo escribe a partir de lo que responde el SIN. Un
 * cliente que lo afirma en el cuerpo se rechaza SIEMPRE, también con `SIAT_MODE=disabled`: antes,
 * en ese modo —el defecto— se persistía tal cual, y una factura podía figurar `ACCEPTED` con un
 * CUF inventado sin haber pasado nunca por el SIN. Se comprueba antes de tocar la base.
 */
export function assertFiscalStatusNotClientAsserted(input: IssueArInvoiceDto): void {
  if (input.electronicTaxDocument) {
    throw new UnprocessableEntityException({
      code: 'FISCAL_STATUS_NOT_CLIENT_ASSERTED',
      message:
        'El estado fiscal de una factura lo da Impuestos Nacionales a través del ERP; no se envía en la petición.',
    });
  }
}

/** El contrato de una factura es de su entidad y su cliente, y está en condiciones de facturarse. */
export function assertContractBillable(
  contract: { legalEntityId: string; counterpartyBpId: string; status: string },
  invoice: { legalEntityId: string; customerBpId: string },
): void {
  if (
    contract.legalEntityId !== invoice.legalEntityId ||
    contract.counterpartyBpId !== invoice.customerBpId
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

/** Con impuesto hacen falta cuenta pasiva y código tributario; sin impuesto, ninguna cuenta fiscal. */
export function assertTaxFieldsConsistent(input: ResolvedArInvoice): void {
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

/** `invoiceNo` NO se edita: renumerar una factura emitida deja un hueco y un duplicado en la serie. */
const EDITABLE_INVOICE_FIELDS = ['invoiceDate', 'dueDate', 'status'];

export function pickEditableInvoiceFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => EDITABLE_INVOICE_FIELDS.includes(key)),
  );
}

/**
 * Por qué una factura NO se puede borrar: sólo se borra la que no dejó rastro contable (en
 * borrador, sin asiento, sin cobros y sin documento fiscal). Vacío si se puede borrar.
 */
export function invoiceDeletionBlockers(
  invoice: { status: string; accountingDocumentId?: string | null },
  trace: { receiptAllocations: number; fiscalDocuments: number },
): string[] {
  return [
    ...(invoice.status !== 'DRAFT' ? [`STATUS_${invoice.status}`] : []),
    ...(invoice.accountingDocumentId ? ['HAS_ACCOUNTING_DOCUMENT'] : []),
    ...(trace.receiptAllocations > 0 ? ['HAS_RECEIPT_ALLOCATIONS'] : []),
    ...(trace.fiscalDocuments > 0 ? ['HAS_FISCAL_DOCUMENT'] : []),
  ];
}

/** Asiento de la factura: CxC por el bruto, ingreso por el neto y, si hay, IVA débito. */
export function buildInvoiceJournalLines(
  input: ResolvedArInvoice,
  grossAmount: number,
  invoiceId: string,
  invoiceNo: string,
): CreateAccountingDocumentDto['lines'] {
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
