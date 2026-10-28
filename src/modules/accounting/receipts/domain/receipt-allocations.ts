import { BadRequestException } from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../../../../common/money/decimal-amount.util';

/** Centavos exactos (`bigint`) de vuelta al `number` de dos decimales que ya devolvían los errores. */
export const money = (minor: bigint): number => Number(fromMinorUnits(minor));

interface ReceiptWithAllocations {
  amount: number | string;
  allocations: ReadonlyArray<{ arInvoiceId: string; allocatedAmount: number | string }>;
}

/**
 * Las asignaciones suman EXACTAMENTE el recibo y se agrupan por factura, todo en centavos `bigint`.
 * Antes se sumaba en coma flotante y se aceptaba una diferencia de hasta 0.009: la suma de
 * asignaciones es igual al recibo o no lo es.
 */
export function allocationsByInvoice(input: ReceiptWithAllocations): Map<string, bigint> {
  const byInvoice = new Map<string, bigint>();
  let total = 0n;
  for (const { arInvoiceId, allocatedAmount } of input.allocations) {
    const minor = toMinorUnits(allocatedAmount);
    total += minor;
    byInvoice.set(arInvoiceId, (byInvoice.get(arInvoiceId) ?? 0n) + minor);
  }
  if (total !== toMinorUnits(input.amount)) {
    throw new BadRequestException({
      code: 'RECEIPT_ALLOCATION_TOTAL_MISMATCH',
      message: 'La suma de asignaciones debe ser igual al monto total del recibo.',
      details: { amount: input.amount, allocationTotal: money(total) },
    });
  }
  return byInvoice;
}
