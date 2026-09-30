import type { CommercialProposalModel } from '../models/b2b-sales-crm.models';

/**
 * Las condiciones de una propuesta en palabras del comercio. Correo y PDF salen de aquí, así los dos
 * dicen exactamente lo mismo.
 */
const CONCEPTO: Readonly<Record<string, string>> = {
  MDR: 'Comisión por venta',
  SUBSCRIPTION: 'Suscripción',
  SETUP_FEE: 'Cargo de habilitación',
  SERVICE_FEE: 'Cargo por servicio',
  PENALTY: 'Penalidad',
  MINIMUM_MONTHLY_FEE: 'Mínimo mensual',
};

const COBRO: Readonly<Record<string, string>> = {
  PER_TRANSACTION: 'Por cada venta',
  MONTHLY: 'Mensual',
  ONE_TIME: 'Una sola vez',
  ON_DEMAND: 'Cuando se solicita',
};

/** Cargo con el que firma quien envía; un rol sin traducir firma como «Equipo comercial». */
const CARGO: Readonly<Record<string, string>> = {
  COMMERCIAL_EXECUTIVE: 'Ejecutivo comercial',
  COMMERCIAL_MANAGER: 'Gerente comercial',
  FINANCE: 'Finanzas',
  LEGAL: 'Legal',
};

export function cargoDe(roleCode: string | null | undefined): string {
  return (roleCode && CARGO[roleCode]) || 'Equipo comercial';
}

export function importe(valor: string | number | null | undefined, currency = 'BOB'): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return String(valor);
  const cifra = numero.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency === 'BOB' ? 'Bs' : currency} ${cifra}`;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `2026-10-30` → `30 de octubre de 2026`; sin fecha, «sin fecha límite». */
export function fechaLegible(valor: string | Date | null | undefined): string {
  if (!valor) return 'sin fecha límite';
  const iso = valor instanceof Date ? valor.toISOString() : String(valor);
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d || !MESES[m - 1]) return iso;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export interface CondicionLegible {
  concepto: string;
  detalle: string | null;
  condicion: string;
  cobro: string;
}

export function condicionesDePropuesta(proposal: CommercialProposalModel): CondicionLegible[] {
  return (proposal.lines ?? []).map((line) => {
    const partes: string[] = [];
    if (line.ratePercent !== null && line.ratePercent !== undefined && line.ratePercent !== '') {
      partes.push(
        `${Number(line.ratePercent).toLocaleString('es-BO', { maximumFractionDigits: 4 })} %`,
      );
    }
    if (line.fixedAmount !== null && line.fixedAmount !== undefined && line.fixedAmount !== '') {
      partes.push(importe(line.fixedAmount, line.currency));
    }
    // Si el concepto YA es el mínimo, la cifra va sola: «Mínimo mensual · Bs 300,00».
    if (line.minimumMonthlyAmount) {
      partes.push(
        line.termType === 'MINIMUM_MONTHLY_FEE' && partes.length === 0
          ? importe(line.minimumMonthlyAmount, line.currency)
          : `mínimo ${importe(line.minimumMonthlyAmount, line.currency)} al mes`,
      );
    }
    const concepto = CONCEPTO[line.termType] ?? line.termType;
    const descripcion = line.description?.trim() ?? '';
    // Un detalle que sólo repite el concepto («MDR», «Mínimo») no dice nada: se omite.
    const repetido =
      !descripcion ||
      descripcion === line.termType ||
      concepto.toLowerCase().includes(descripcion.toLowerCase());
    return {
      concepto,
      detalle: repetido ? null : descripcion,
      condicion: partes.join(' + ') || 'Sin costo',
      cobro: COBRO[line.billingTiming] ?? line.billingTiming,
    };
  });
}
