/**
 * Aritmética de la facturación B2B y del MDR, en unidades menores exactas (P-07).
 *
 * Antes cada servicio sumaba importes con `Number(...)` y redondeaba con
 * `Math.round((x + Number.EPSILON) * 100) / 100`, con una tolerancia de un céntimo en todas las
 * comparaciones. Eso dejaba pasar una cuota que no sumaba el financiado por 0,01, una factura cuyo
 * IVA de cabecera no era la suma del de sus líneas y una factura que mezclaba cargos en BOB y USD
 * sumados como si fueran la misma moneda. Aquí no hay tolerancia: o cuadra al céntimo o se rechaza.
 *
 * Las funciones son puras —sin base ni Nest— para que el invariante se pruebe sin infraestructura
 * (`test/money-business-invariants.spec.ts`) y el mismo código lo usen el servicio y el esquema Zod.
 */
import {
  CurrencyMismatchError,
  allocateProportionally,
  applyRatePercent,
  assertSingleCurrency,
  fromMinorUnits,
  parseMoney,
  parseRatePercent,
  sumMinor,
} from '../../../common/money/decimal-amount.util';

/** Proporción del pago inicial sobre la compra (regla del producto BNPL): 60 %. */
export const DOWN_PAYMENT_RATE_PERCENT = '60';

export class MoneyRuleViolation extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'MoneyRuleViolation';
  }
}

export interface PurchaseSplitInput {
  purchaseAmount: unknown;
  downPaymentAmount: unknown;
  financedAmount: unknown;
  installments: ReadonlyArray<{ installmentNumber: number; amount: unknown }>;
}

export interface PurchaseSplit {
  purchase: bigint;
  downPayment: bigint;
  financed: bigint;
  installments: bigint[];
}

/**
 * Valida el reparto de una compra BNPL y devuelve las violaciones (vacío = correcto).
 *
 * - El pago inicial es el 60 % de la compra redondeado a céntimo; se admite ±0,01 porque quien lo
 *   calcula fuera puede redondear distinto un medio céntimo exacto (única tolerancia, y es sobre el
 *   REPARTO, no sobre el total).
 * - Financiado = compra − inicial, EXACTO: ningún céntimo desaparece entre las dos partes.
 * - Suma de cuotas = financiado, EXACTO.
 */
export function purchaseSplitViolations(input: PurchaseSplitInput): MoneyRuleViolation[] {
  const violations: MoneyRuleViolation[] = [];
  let split: PurchaseSplit;
  try {
    split = parsePurchaseSplit(input);
  } catch (error) {
    return [new MoneyRuleViolation('INVALID_AMOUNT', (error as Error).message, 'purchaseAmount')];
  }

  const expectedDown = applyRatePercent(
    split.purchase,
    parseRatePercent(DOWN_PAYMENT_RATE_PERCENT),
  );
  const downDelta = split.downPayment - expectedDown;
  if (downDelta > 1n || downDelta < -1n) {
    violations.push(
      new MoneyRuleViolation(
        'DOWN_PAYMENT_NOT_60_PERCENT',
        'El pago inicial debe representar 60% de la compra.',
        'downPaymentAmount',
      ),
    );
  }

  if (split.purchase - split.downPayment !== split.financed) {
    violations.push(
      new MoneyRuleViolation(
        'FINANCED_NOT_REMAINDER',
        'El monto financiado debe representar el 40% restante.',
        'financedAmount',
      ),
    );
  }

  if (sumMinor(split.installments) !== split.financed) {
    violations.push(
      new MoneyRuleViolation(
        'INSTALLMENTS_NOT_EQUAL_FINANCED',
        'La suma de cuotas debe coincidir con el monto financiado.',
        'installments',
      ),
    );
  }

  const seen = new Set<number>();
  for (const installment of input.installments) {
    if (seen.has(installment.installmentNumber)) {
      violations.push(
        new MoneyRuleViolation(
          'DUPLICATED_INSTALLMENT_NUMBER',
          'No se permiten números de cuota duplicados.',
          'installments',
        ),
      );
      break;
    }
    seen.add(installment.installmentNumber);
  }

  return violations;
}

export function parsePurchaseSplit(input: PurchaseSplitInput): PurchaseSplit {
  return {
    purchase: parseMoney(input.purchaseAmount, { allowZero: false }),
    downPayment: parseMoney(input.downPaymentAmount),
    financed: parseMoney(input.financedAmount),
    installments: input.installments.map((installment) =>
      parseMoney(installment.amount, { allowZero: false }),
    ),
  };
}

export interface MdrPricing {
  /** Tasa tal como la guarda la versión contractual (`numeric(9,6)`). */
  ratePercent: string | number;
  minFeeAmount?: string | number | null;
  maxFeeAmount?: string | number | null;
}

export interface MdrFee {
  rateUnits: bigint;
  /** Tasa canónica con 6 decimales, lista para guardar. */
  ratePercent: string;
  feeMinor: bigint;
  fee: string;
}

/**
 * Comisión MDR de una compra: `compra × tasa %`, redondeada con la regla del dinero y acotada por
 * el mínimo y el máximo de la regla. La tasa se toma de la versión contractual VIGENTE AL MOMENTO
 * DE LA COMPRA —la que el llamador resolvió y guarda en `bnpl_purchases.contract_version_id`— y la
 * factura posterior reutiliza el importe ya calculado: nunca se recalcula con el contrato vigente
 * al facturar.
 */
export function computeMdrFee(purchaseAmount: unknown, pricing: MdrPricing): MdrFee {
  const purchase = parseMoney(purchaseAmount, { allowZero: false });
  const rateUnits = parseRatePercent(pricing.ratePercent);
  let fee = applyRatePercent(purchase, rateUnits);
  if (pricing.minFeeAmount !== null && pricing.minFeeAmount !== undefined) {
    const min = parseMoney(pricing.minFeeAmount);
    if (fee < min) fee = min;
  }
  if (pricing.maxFeeAmount !== null && pricing.maxFeeAmount !== undefined) {
    const max = parseMoney(pricing.maxFeeAmount);
    if (fee > max) fee = max;
  }
  return {
    rateUnits,
    ratePercent: fromMinorUnits(rateUnits, 6),
    feeMinor: fee,
    fee: fromMinorUnits(fee),
  };
}

export interface InvoiceableCharge {
  id: string;
  amountOpen: string | number;
  currency: string;
}

export interface InvoiceTotals {
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  lines: Array<{ id: string; net: string; tax: string; total: string }>;
}

/**
 * Totales de una factura de comercio.
 *
 * - Todos los cargos deben ser de UNA moneda: sumar BOB con USD no es un total.
 * - El impuesto se calcula sobre el subtotal (como antes) y se REPARTE entre las líneas en
 *   proporción a su neto con residuo en la primera: la suma del impuesto de las líneas es
 *   exactamente el de la cabecera. Antes cada línea redondeaba por su cuenta y podían diferir.
 * - La tasa llega de la configuración (`DEFAULT_TAX_RATE_PERCENT`); su valor lo valida Fiscal.
 */
export function computeInvoiceTotals(
  charges: readonly InvoiceableCharge[],
  taxRatePercent: string | number,
): InvoiceTotals {
  if (charges.length === 0) {
    throw new MoneyRuleViolation('NO_CHARGES', 'La factura necesita al menos un cargo.', 'charges');
  }
  let currency: string;
  try {
    currency = assertSingleCurrency(charges.map((charge) => charge.currency));
  } catch (error) {
    if (error instanceof CurrencyMismatchError) {
      throw new MoneyRuleViolation(
        'MIXED_CURRENCIES',
        'No se pueden facturar juntos cargos de monedas distintas.',
        'receivableIds',
      );
    }
    throw error;
  }

  const nets = charges.map((charge) =>
    parseMoney(charge.amountOpen, { currency, allowZero: false }),
  );
  const subtotal = sumMinor(nets);
  const tax = applyRatePercent(subtotal, parseRatePercent(taxRatePercent));
  const lineTaxes = allocateProportionally(tax, nets);

  return {
    currency,
    subtotal: fromMinorUnits(subtotal),
    tax: fromMinorUnits(tax),
    total: fromMinorUnits(subtotal + tax),
    lines: charges.map((charge, index) => ({
      id: charge.id,
      net: fromMinorUnits(nets[index]!),
      tax: fromMinorUnits(lineTaxes[index]!),
      total: fromMinorUnits(nets[index]! + lineTaxes[index]!),
    })),
  };
}

/** ¿Suman las asignaciones exactamente el pago? Sin tolerancia de céntimo. */
export function allocationsMatchPayment(
  amount: unknown,
  allocations: ReadonlyArray<{ amountApplied: unknown }>,
  currency = 'BOB',
): boolean {
  const payment = parseMoney(amount, { currency, allowZero: false });
  const applied = allocations.map((allocation) =>
    parseMoney(allocation.amountApplied, { currency, allowZero: false }),
  );
  return sumMinor(applied) === payment;
}
