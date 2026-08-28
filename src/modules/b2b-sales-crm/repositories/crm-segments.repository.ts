import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { merchantSizeBand, tenureMonths } from '../../../common/segmentation/business-bands';
import type { FactContext } from '../../../common/segmentation/rule-engine';
import type { CrmSegmentAttribute, SubjectFacts } from '../domain/crm-segments';

/** Cuotas que el cliente no pagó a tiempo. `COVERED_BY_ATLAS` cuenta: Atlas adelantó, él debe. */
const LATE_INSTALLMENT_STATUSES = ['OVERDUE', 'COVERED_BY_ATLAS'];
/** Recuperaciones que siguen abiertas: lo cobrado o dado de baja ya no es exposición. */
const OPEN_RECOVERY_STATUSES = ['OPEN', 'IN_COLLECTION', 'PARTIALLY_RECOVERED'];
/** Cargos que ya no representan deuda del partner. */
const CLOSED_RECEIVABLE_STATUSES = ['PAID', 'CANCELLED'];

interface PartnerRow {
  id: string;
  label: string;
  account_type: string | null;
  lifecycle_status: string | null;
  industry: string | null;
  category: string | null;
  city: string | null;
  country_code: string | null;
  territory: string | null;
  risk_tier: string | null;
  rating_grade: string | null;
  tags: string[] | null;
  employee_count: number | null;
  expected_monthly_volume: string | null;
  open_debt_amount: string | null;
  branch_count: number | string | null;
  created_at: Date | null;
}

interface ApplicantRow {
  id: string;
  label: string | null;
  risk_tier_at_origination: string | null;
  cohort_id: string | null;
  merchant_category: string | null;
  merchant_city: string | null;
  purchase_count: number | string | null;
  financed_amount: string | null;
  overdue_installment_count: number | string | null;
  max_days_past_due: number | string | null;
  open_recovery_count: number | string | null;
  first_purchase_at: Date | null;
}

/**
 * De dónde salen los hechos que un segmento comercial mira.
 *
 * ## Por qué se proyecta la población ENTERA y se evalúa en memoria
 *
 * La alternativa sería traducir cada definición a un `WHERE` y contar en la base. Es más rápido y
 * es peor: obligaría a que el traductor SQL y el evaluador de reglas coincidan siempre, y el día
 * que difieran —un `BETWEEN` inclusivo aquí y exclusivo allá— el mismo segmento diría un número en
 * la lista y otro al abrirlo, sin que ninguna de las dos vistas se pueda declarar rota. Con una
 * sola proyección por sujeto y el motor de reglas común, la respuesta es una.
 *
 * El coste es acotado y conocido: son dos consultas agregadas por pantalla, sobre la cartera de
 * partners y la de clientes con crédito —miles de filas, no millones—, y NO crece con el número de
 * segmentos del catálogo, que es lo que sí crecería con un `WHERE` por segmento.
 *
 * ## Qué NO viaja
 *
 * Del solicitante de crédito, nada que lo nombre. `consumers_ref` guarda un id opaco y una
 * referencia externa, y ni siquiera esa referencia sale de aquí: la etiqueta que se muestra son
 * los últimos caracteres del id, suficiente para distinguir dos filas en pantalla e inútil para
 * identificar a nadie.
 */
@Injectable()
export class CrmSegmentsRepository {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  /**
   * Los partners y lo que se sabe de ellos.
   *
   * Las cuentas archivadas quedan fuera: siguen existiendo para el histórico, pero contar en el
   * alcance de un segmento a quien ya no opera daría un número que no se puede accionar.
   */
  async findPartnerFacts(now: Date = new Date()): Promise<SubjectFacts[]> {
    const rows = await this.sequelize.query<PartnerRow>(
      `
        SELECT
          a.id,
          coalesce(a.trade_name, a.legal_name) AS label,
          a.account_type,
          a.lifecycle_status,
          a.industry,
          -- El rubro fino cuando está; la línea de negocio como respaldo en cuentas migradas.
          coalesce(a.category, a.business_line) AS category,
          a.city,
          a.country_code,
          t.name AS territory,
          a.risk_tier,
          -- Proyección que el motor de calificación mantiene sobre la cuenta: sin join por fila.
          a.risk_rating_grade AS rating_grade,
          a.employee_count,
          a.expected_monthly_volume::text AS expected_monthly_volume,
          a.created_at,
          (
            SELECT array_agg(tag.name)
            FROM atlas_sales.b2b_account_tags link
            JOIN atlas_sales.account_tags tag ON tag.id = link.tag_id
            WHERE link.account_id = a.id
          ) AS tags,
          (
            SELECT count(*)::int
            FROM atlas_sales.merchant_branches branch
            WHERE branch.account_id = a.id
          ) AS branch_count,
          (
            SELECT coalesce(sum(r.amount_open), 0)::text
            FROM atlas_sales.merchant_receivables r
            WHERE r.account_id = a.id
              AND r.status NOT IN (:closedReceivables)
          ) AS open_debt_amount
        FROM atlas_sales.b2b_accounts a
        LEFT JOIN atlas_sales.territories t ON t.id = a.territory_id
        WHERE a.archived_at IS NULL
        ORDER BY label ASC
      `,
      {
        replacements: { closedReceivables: CLOSED_RECEIVABLE_STATUSES },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      facts: compact({
        accountType: row.account_type,
        lifecycleStatus: row.lifecycle_status,
        industry: row.industry,
        category: row.category,
        city: row.city,
        countryCode: row.country_code,
        territory: row.territory,
        riskTier: row.risk_tier,
        ratingGrade: row.rating_grade,
        tag: row.tags ?? undefined,
        sizeBand: merchantSizeBand(row.employee_count),
        expectedMonthlyVolume: numberOrUndefined(row.expected_monthly_volume),
        openDebtAmount: numberOrUndefined(row.open_debt_amount),
        tenureMonths: tenureMonths(row.created_at, now),
        branchCount: numberOrUndefined(row.branch_count),
      }),
    }));
  }

  /**
   * Los clientes solicitantes de crédito y su comportamiento de pago.
   *
   * La población son los clientes que el ERP conoce, que son los que llegaron a comprar a plazos:
   * la solicitud que el motor rechazó nunca cruza a este lado —vive en AtlasBackend—, así que un
   * segmento de aquí habla de cartera y no de demanda. Es una diferencia que cambia la lectura de
   * cualquier porcentaje y por eso está escrita.
   */
  async findCreditApplicantFacts(now: Date = new Date()): Promise<SubjectFacts[]> {
    const rows = await this.sequelize.query<ApplicantRow>(
      `
        WITH ultima_compra AS (
          -- La banda de riesgo y la cohorte se fijan en el ORIGEN de cada compra: la vigente es la
          -- de la última, no un promedio que no significaría nada.
          SELECT DISTINCT ON (p.consumer_id)
            p.consumer_id, p.risk_tier_at_origination, p.cohort_id, p.merchant_account_id
          FROM atlas_sales.bnpl_purchases p
          ORDER BY p.consumer_id, p.purchase_date DESC
        ),
        agregado AS (
          SELECT p.consumer_id,
                 count(*)::int AS purchase_count,
                 sum(p.financed_amount)::text AS financed_amount,
                 min(p.purchase_date) AS first_purchase_at
          FROM atlas_sales.bnpl_purchases p
          GROUP BY p.consumer_id
        ),
        mora AS (
          SELECT p.consumer_id,
                 count(*) FILTER (WHERE i.status IN (:lateInstallments))::int AS overdue_count
          FROM atlas_sales.bnpl_installments i
          JOIN atlas_sales.bnpl_purchases p ON p.id = i.purchase_id
          GROUP BY p.consumer_id
        ),
        recuperacion AS (
          SELECT r.consumer_id,
                 max(r.days_past_due)::int AS max_days_past_due,
                 count(*) FILTER (WHERE r.recovery_status IN (:openRecoveries))::int
                   AS open_recovery_count
          FROM atlas_sales.consumer_recovery_receivables r
          GROUP BY r.consumer_id
        )
        SELECT
          c.id,
          -- Nunca un nombre ni la referencia externa: sólo lo justo para distinguir dos filas.
          right(c.id::text, 8) AS label,
          u.risk_tier_at_origination,
          u.cohort_id,
          coalesce(m.category, m.business_line) AS merchant_category,
          m.city AS merchant_city,
          coalesce(g.purchase_count, 0) AS purchase_count,
          g.financed_amount,
          g.first_purchase_at,
          coalesce(mo.overdue_count, 0) AS overdue_installment_count,
          coalesce(rec.max_days_past_due, 0) AS max_days_past_due,
          coalesce(rec.open_recovery_count, 0) AS open_recovery_count
        FROM atlas_sales.consumers_ref c
        LEFT JOIN agregado g ON g.consumer_id = c.id
        LEFT JOIN ultima_compra u ON u.consumer_id = c.id
        LEFT JOIN atlas_sales.b2b_accounts m ON m.id = u.merchant_account_id
        LEFT JOIN mora mo ON mo.consumer_id = c.id
        LEFT JOIN recuperacion rec ON rec.consumer_id = c.id
        ORDER BY c.created_at DESC
      `,
      {
        replacements: {
          lateInstallments: LATE_INSTALLMENT_STATUSES,
          openRecoveries: OPEN_RECOVERY_STATUSES,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((row) => ({
      id: row.id,
      label: `Cliente ···${row.label ?? ''}`,
      facts: compact({
        riskTierAtOrigination: row.risk_tier_at_origination,
        cohortId: row.cohort_id,
        merchantCategory: row.merchant_category,
        merchantCity: row.merchant_city,
        purchaseCount: numberOrUndefined(row.purchase_count),
        financedAmount: numberOrUndefined(row.financed_amount),
        overdueInstallmentCount: numberOrUndefined(row.overdue_installment_count),
        maxDaysPastDue: numberOrUndefined(row.max_days_past_due),
        openRecoveryCount: numberOrUndefined(row.open_recovery_count),
        monthsSinceFirstPurchase: tenureMonths(row.first_purchase_at, now),
      }),
    }));
  }
}

/**
 * Quita los hechos que no se saben.
 *
 * Dejar un `null` en el contexto no sería lo mismo que quitarlo: `EXISTS` tiene que poder
 * distinguir «no lo sé» de «lo sé y está vacío», y la regla que mira un hecho ausente falla
 * cerrado. Un `0` sí se conserva —cero compras es un hecho, no una ausencia—.
 */
function compact(
  facts: Record<string, string | number | readonly string[] | null | undefined>,
): FactContext<CrmSegmentAttribute> {
  const clean: Record<string, string | number | readonly string[]> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    clean[key] = value;
  }
  return clean as FactContext<CrmSegmentAttribute>;
}

/** `NUMERIC` llega como texto para no perder precisión; aquí sí se compara como número. */
function numberOrUndefined(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
