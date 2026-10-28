import { ConflictException } from '@nestjs/common';

/**
 * Reglas del PATCH de documentos que ya tocaron el mayor (factura AR y recibo de cobro).
 *
 * El PATCH aceptaba cualquier `status` del dominio y cualquier fecha sobre un documento ya
 * contabilizado. Con eso un contable podía marcar `PAID` una factura que nadie cobró, o `VOID` un
 * recibo cuyas asignaciones y asiento seguían vivos, y el mayor y el subauxiliar dejaban de contar
 * lo mismo sin dejar un contra-asiento. Los estados los mueven la emisión, los cobros y la
 * anulación fiscal; el PATCH sólo corrige lo que no cambia ningún saldo.
 */
export type PatchedDocumentKind = 'AR_INVOICE' | 'RECEIPT';

/** El día de una fecha (`Date` o texto `AAAA-MM-DD…`), para comparar sin zona horaria de por medio. */
function dayOf(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value ?? null;
}

/**
 * Cambiar de estado por PATCH sólo se admite para descartar un BORRADOR (`DRAFT` → `VOID`, sin
 * rastro contable). Repetir el estado actual es un no-op y se acepta para no romper a quien manda
 * el objeto entero.
 */
export function assertStatusChangeAllowed(
  kind: PatchedDocumentKind,
  currentStatus: string,
  requestedStatus: string | undefined,
): void {
  if (requestedStatus === undefined || requestedStatus === currentStatus) return;
  if (currentStatus === 'DRAFT' && requestedStatus === 'VOID') return;
  throw new ConflictException({
    code: `${kind}_STATUS_MANAGED_BY_WORKFLOW`,
    message:
      'El estado no se edita a mano: lo mueven la emisión, los cobros y la anulación. ' +
      'Para deshacer un documento contabilizado se reversa su asiento.',
    details: { from: currentStatus, to: requestedStatus },
  });
}

/** Un documento contabilizado (o que ya salió de borrador) no cambia el campo que fechó su asiento. */
export function assertPostedFieldUnchanged(
  kind: PatchedDocumentKind,
  field: string,
  posted: boolean,
  currentValue: unknown,
  requestedValue: unknown,
): void {
  if (!posted || requestedValue === undefined) return;
  if (dayOf(currentValue) === dayOf(requestedValue)) return;
  throw new ConflictException({
    code: `${kind}_POSTED_FIELD_LOCKED`,
    message: `El campo ${field} no se edita en un documento ya contabilizado: se reversa su asiento y se emite de nuevo.`,
    details: { field },
  });
}

interface PatchableRow {
  status: string;
  accountingDocumentId?: string | null;
}

/** Un documento contabilizado: ya salió de borrador o ya tiene asiento. */
const isPosted = (row: PatchableRow): boolean =>
  row.status !== 'DRAFT' || Boolean(row.accountingDocumentId);

/** Lo que el PATCH de un recibo puede o no puede tocar (el banco y la fecha fechan su asiento). */
export function assertReceiptPatchAllowed(
  row: PatchableRow & { receiptDate: Date | string; bankAccountId: string | null },
  changes: Record<string, unknown>,
): void {
  const kind = 'RECEIPT';
  assertStatusChangeAllowed(kind, row.status, changes.status as string | undefined);
  assertPostedFieldUnchanged(
    kind,
    'receiptDate',
    isPosted(row),
    row.receiptDate,
    changes.receiptDate,
  );
  assertPostedFieldUnchanged(
    kind,
    'bankAccountId',
    isPosted(row),
    row.bankAccountId,
    changes.bankAccountId,
  );
}

/** Lo que el PATCH de una factura AR puede o no puede tocar (el vencimiento sí; la fecha, no). */
export function assertInvoicePatchAllowed(
  row: PatchableRow & { invoiceDate: Date | string },
  changes: Record<string, unknown>,
): void {
  const kind = 'AR_INVOICE';
  assertStatusChangeAllowed(kind, row.status, changes.status as string | undefined);
  assertPostedFieldUnchanged(
    kind,
    'invoiceDate',
    isPosted(row),
    row.invoiceDate,
    changes.invoiceDate,
  );
}
