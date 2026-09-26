import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { fechaHoraLocal } from '../../fiscal/siat/domain/fecha-local';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BBnplBillingService } from '../services/b2b-bnpl-billing.service';

/** Una factura fiscal admite hasta 500 líneas (XSD del SIN): los cargos se facturan en tandas. */
export const MAX_LINEAS_POR_FACTURA = 500;
const ZONA = 'America/La_Paz';

export interface ResultadoCorrida {
  runId: string | null;
  cycleKey: string;
  status: 'DONE' | 'PARTIAL' | 'FAILED' | 'ALREADY_RUN';
  invoicesCreated: number;
  errors: { accountId: string; code: string; message: string }[];
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** `MONTHLY:2026-09` = el mes que se cierra el 1 de octubre. */
export function claveDelCicloCerrado(hoyLocal: string): string {
  const [anio, mes] = hoyLocal.split('-').map(Number) as [number, number];
  const anterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`;
  return `MONTHLY:${anterior}`;
}

/**
 * Cierre de facturación de comercios (D-4 del plan): el día 1, por cada comercio con cargos CxC
 * `PENDING` sin factura anteriores al día 1, emite su factura —en tandas de ≤ 500 líneas— por el
 * mismo camino que la emisión manual, así que con SIAT activo cada una sale con su documento fiscal.
 *
 * Idempotente por ciclo: la corrida se reclama insertando su `cycle_key` (única). Una segunda
 * instancia —o un segundo clic— recibe `ALREADY_RUN` y no factura nada.
 *
 * La contabilización al mayor sigue siendo el `post-to-gl` de siempre: automatizarla necesita las
 * cuentas por defecto de cada entidad y queda fuera de este paso.
 */
@Injectable()
export class MerchantBillingCycleService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly billing: B2BBnplBillingService,
    private readonly logger: PinoLoggerService,
  ) {}

  hoyLocal(ahora = new Date()): string {
    return fechaHoraLocal(ahora, ZONA).slice(0, 10);
  }

  async ejecutar(
    opciones: { trigger: 'SCHEDULE' | 'MANUAL'; requestedBy?: string | null; ahora?: Date } = {
      trigger: 'SCHEDULE',
    },
  ): Promise<ResultadoCorrida> {
    const hoy = this.hoyLocal(opciones.ahora);
    const cycleKey = claveDelCicloCerrado(hoy);
    const sequelize = this.repository.sequelize;
    const [run] = await sequelize.query<{ id: string }>(
      `INSERT INTO atlas_sales.merchant_billing_runs (cycle_key, invoice_date, trigger, requested_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cycle_key) DO NOTHING
       RETURNING id`,
      {
        bind: [cycleKey, hoy, opciones.trigger, opciones.requestedBy ?? null],
        type: QueryTypes.SELECT,
      },
    );
    if (!run) {
      return { runId: null, cycleKey, status: 'ALREADY_RUN', invoicesCreated: 0, errors: [] };
    }

    // Cargos devengados ANTES del día 1 (hora de Bolivia), agrupados por comercio y moneda.
    const cargos = await sequelize.query<{ id: string; account_id: string; currency: string }>(
      `SELECT id, account_id, currency
         FROM atlas_sales.merchant_receivables
        WHERE status = 'PENDING' AND invoice_id IS NULL AND amount_open > 0
          AND issued_at < ($1::date)::timestamp AT TIME ZONE $2
        ORDER BY account_id, currency, issued_at, id`,
      { bind: [hoy, ZONA], type: QueryTypes.SELECT },
    );
    const grupos = new Map<string, { accountId: string; ids: string[] }>();
    for (const cargo of cargos) {
      const clave = `${cargo.account_id}|${cargo.currency}`;
      const grupo = grupos.get(clave) ?? { accountId: cargo.account_id, ids: [] };
      grupo.ids.push(cargo.id);
      grupos.set(clave, grupo);
    }

    const facturas: Record<string, unknown>[] = [];
    const errores: ResultadoCorrida['errors'] = [];
    for (const { accountId, ids } of grupos.values()) {
      for (let i = 0; i < ids.length; i += MAX_LINEAS_POR_FACTURA) {
        try {
          const factura = await this.billing.issueInvoice({
            accountId,
            invoiceDate: hoy,
            dueDate: sumarDias(hoy, env.MERCHANT_BILLING_DUE_DAYS),
            receivableIds: ids.slice(i, i + MAX_LINEAS_POR_FACTURA),
          });
          facturas.push({
            invoiceId: factura.id,
            invoiceNumber: factura.invoiceNumber,
            accountId,
            fiscalDocument: factura.fiscalDocument ?? null,
          });
        } catch (error) {
          // Un comercio que falla (sin NIT, producto sin homologar…) no detiene a los demás.
          const respuesta = (error as { response?: { code?: string; message?: string } }).response;
          errores.push({
            accountId,
            code: respuesta?.code ?? (error instanceof Error ? error.name : 'ERROR'),
            message: respuesta?.message ?? (error instanceof Error ? error.message : String(error)),
          });
        }
      }
    }

    const status: ResultadoCorrida['status'] =
      errores.length === 0 ? 'DONE' : facturas.length > 0 ? 'PARTIAL' : 'FAILED';
    await sequelize.query(
      `UPDATE atlas_sales.merchant_billing_runs
          SET status = $2, finished_at = now(), accounts_considered = $3,
              invoices_created = $4, invoices = $5::jsonb, errors = $6::jsonb
        WHERE id = $1`,
      {
        bind: [
          run.id,
          status,
          new Set([...grupos.values()].map((g) => g.accountId)).size,
          facturas.length,
          JSON.stringify(facturas),
          JSON.stringify(errores),
        ],
      },
    );
    if (errores.length > 0) {
      this.logger.warnContext(
        MerchantBillingCycleService.name,
        'Cierre de facturación con errores',
        {
          alert: 'MERCHANT_BILLING_RUN_ERRORS',
          cycleKey,
          errores: errores.length,
        },
      );
    }
    return { runId: run.id, cycleKey, status, invoicesCreated: facturas.length, errors: errores };
  }

  listar() {
    return this.repository.sequelize.query(
      `SELECT * FROM atlas_sales.merchant_billing_runs ORDER BY started_at DESC LIMIT 50`,
      { type: QueryTypes.SELECT },
    );
  }
}
