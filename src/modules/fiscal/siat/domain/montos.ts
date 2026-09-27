/**
 * Fórmulas del SIN para el sector 1 (compra-venta), sobre la aritmética exacta del ERP.
 *
 * Los importes de la factura fiscal van CON IVA (el ejemplo oficial: precio 100, subtotal 100,
 * descuento adicional 1, total 99; el XML no tiene campo de impuesto). Redondeo HALF_UP a 2
 * decimales, igual que el resto del ERP (`decimal-amount.util.ts`): aquí no hay un tercer módulo de
 * redondeo, sólo las fórmulas.
 */
import {
  divideRounded,
  fromMinorUnits,
  parseDecimalExact,
  sumMinor,
} from '../../../../common/money/decimal-amount.util';

/** Decimales admitidos en `cantidad` por el XSD. */
const ESCALA_CANTIDAD = 5;

export interface LineaFiscalEntrada {
  cantidad: string | number;
  precioUnitario: string | number;
  montoDescuento?: string | number | null;
}

export interface LineaFiscal {
  cantidad: string;
  precioUnitario: string;
  montoDescuento: string;
  subTotal: string;
}

export interface TotalesFiscales {
  lineas: LineaFiscal[];
  descuentoAdicional: string;
  montoTotal: string;
  montoTotalSujetoIva: string;
  montoTotalMoneda: string;
  /** El total en unidades menores, para compararlo con el de la factura del ERP. */
  montoTotalMinor: bigint;
}

export class MontosFiscalesError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MontosFiscalesError';
  }
}

function cantidadMinor(valor: string | number): bigint {
  return parseDecimalExact(valor, ESCALA_CANTIDAD);
}

function formatoCantidad(minor: bigint): string {
  return fromMinorUnits(minor, ESCALA_CANTIDAD).replace(/\.?0+$/, '') || '0';
}

/**
 * `subTotal = cantidad × precioUnitario − montoDescuento`, `montoTotal = Σ subTotal −
 * descuentoAdicional`. `minExclusive 0` del XSD: ninguna cantidad, precio, subtotal ni total puede
 * ser 0 o negativo (el SIN respondería 939).
 */
export function calcularTotales(
  entradas: readonly LineaFiscalEntrada[],
  opciones: { descuentoAdicional?: string | number | null; tipoCambio?: string } = {},
): TotalesFiscales {
  if (entradas.length === 0) {
    throw new MontosFiscalesError('FISCAL_INVOICE_WITHOUT_LINES', 'La factura no tiene líneas.');
  }
  const lineas = entradas.map((entrada, indice) => {
    const cantidad = cantidadMinor(entrada.cantidad);
    const precio = parseDecimalExact(entrada.precioUnitario, 2);
    const descuento = parseDecimalExact(entrada.montoDescuento ?? 0, 2);
    const bruto = divideRounded(cantidad * precio, 10n ** BigInt(ESCALA_CANTIDAD));
    const subTotal = bruto - descuento;
    if (cantidad <= 0n || precio <= 0n || descuento < 0n || subTotal <= 0n) {
      throw new MontosFiscalesError(
        'FISCAL_LINE_AMOUNT_NOT_POSITIVE',
        `La línea ${indice + 1} tiene cantidad, precio o subtotal en cero o negativo; el SIN no la acepta.`,
      );
    }
    return {
      minor: subTotal,
      linea: {
        cantidad: formatoCantidad(cantidad),
        precioUnitario: fromMinorUnits(precio, 2),
        montoDescuento: fromMinorUnits(descuento, 2),
        subTotal: fromMinorUnits(subTotal, 2),
      },
    };
  });
  const descuentoAdicional = parseDecimalExact(opciones.descuentoAdicional ?? 0, 2);
  const total = sumMinor(lineas.map((l) => l.minor)) - descuentoAdicional;
  if (descuentoAdicional < 0n || total <= 0n) {
    throw new MontosFiscalesError(
      'FISCAL_TOTAL_NOT_POSITIVE',
      'El total de la factura es cero o negativo; el SIN no la acepta.',
    );
  }
  const tipoCambio = parseDecimalExact(opciones.tipoCambio ?? '1', 5);
  const totalMoneda = divideRounded(total * 10n ** 5n, tipoCambio);
  return {
    lineas: lineas.map((l) => l.linea),
    descuentoAdicional: fromMinorUnits(descuentoAdicional, 2),
    montoTotal: fromMinorUnits(total, 2),
    montoTotalSujetoIva: fromMinorUnits(total, 2),
    montoTotalMoneda: fromMinorUnits(totalMoneda, 2),
    montoTotalMinor: total,
  };
}
