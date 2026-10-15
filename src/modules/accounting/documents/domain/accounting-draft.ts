import { normalizeAmount, toMinorUnits } from '../../../../common/money/decimal-amount.util';
import type { CreateAccountingDocumentDto } from '../../shared/schemas/accounting.schemas';
import type { ApprovalOrigin } from './approval-policy';

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
 * Hechos de la creación que decide el CÓDIGO de quien llama, nunca el body. `origin` por defecto es
 * MANUAL: sólo los flujos internos que derivan el documento de un hecho de negocio (reverso, recibo,
 * factura, puente del CRM) declaran SERVER_GENERATED. Un `sourceSystem: 'SYSTEM'` en un body no lo es.
 */
export interface CreateDraftOptions {
  origin?: ApprovalOrigin;
}

/**
 * El documento con todo lo que el sistema ya sabía resuelto: número, referencia de origen, fecha
 * de contabilización, período y libro.
 */
export type ResolvedAccountingDocument = AccountingDraftInput & {
  documentNo: string;
  sourceId: string;
  postingDate: Date;
  accountingPeriodId: string;
  ledgerId: string;
};

/**
 * Importe en moneda local de una línea: el informado, o el mayor de debe/haber (una línea válida
 * tiene uno de los dos en cero). Comparación en unidades menores, nunca con `Math.max` sobre
 * `number`, que ya no distingue céntimos cerca del máximo de `numeric(18,2)`.
 */
export function localCurrencyAmountOf(line: DraftJournalLineInput): string {
  if (line.amountLc !== undefined && toMinorUnits(line.amountLc) !== 0n) {
    return normalizeAmount(line.amountLc);
  }
  const debit = toMinorUnits(line.debit);
  const credit = toMinorUnits(line.credit);
  return normalizeAmount(String(debit >= credit ? line.debit : line.credit));
}
