import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { CampaignModel } from '../models';
import type { CampaignPerformanceQueryDto, DashboardQueryDto } from '../ads.dtos';

export interface CampaignPerformanceRow {
  bucket: string;
  bucketLabel: string | null;
  impressions: string;
  clicks: string;
  conversions: string;
  billableEvents: string;
  spendMicros: string;
}

/**
 * Cómo se agrupa el desempeño. Es una lista CERRADA y no una cadena que viaje a la consulta: el
 * agrupamiento va en el `GROUP BY`, donde un parámetro no puede sustituirse, así que la única
 * forma segura de admitirlo desde fuera es elegir entre expresiones escritas aquí.
 */
const PERFORMANCE_GROUPING = {
  CAMPAIGN: {
    expression: 'metric.campaign_id::text',
    labelExpression: 'campaign.name',
    labelIsColumn: true,
  },
  AD_SET: {
    expression: 'metric.ad_set_id::text',
    labelExpression: 'ad_set.name',
    labelIsColumn: true,
  },
  AD: { expression: 'metric.ad_id::text', labelExpression: 'ad.name', labelIsColumn: true },
  // Agrupado por día la etiqueta sobra: el propio `bucket` ya es la fecha. Va como `NULL` en el
  // SELECT y NO en el GROUP BY, porque PostgreSQL rechaza una constante ahí
  // («non-integer constant in GROUP BY») y la consulta entera fallaba con un 500 genérico.
  DAY: { expression: 'metric.metric_date::text', labelExpression: 'NULL', labelIsColumn: false },
} as const;

interface DashboardRow {
  revenueMicros: string;
  billableSpendMicros: string;
  activeCampaigns: string;
  pendingReviews: string;
  overdueInvoices: string;
  invalidEvents: string;
  totalEvents: string;
}

@Injectable()
export class ReportingRepository {
  constructor(
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReportingRepository.name);
  }

  /**
   * Los seis indicadores del tablero publicitario.
   *
   * `invalidEvents` contaba también `is_billable = false`, y bajo un modelo CPM ningún clic ni
   * ninguna conversión es facturable: son eventos legítimos que no se cobran porque lo que se cobra
   * es la impresión. Con tráfico corriente el tablero declaraba un 32 % de eventos «inválidos o
   * sospechosos» cuando la sospecha real era del 3 %, y encendía la alerta de tráfico inválido
   * sobre una operación sana — que es la manera más rápida de enseñar a ignorar una alerta. El
   * propio módulo ya distingue las dos cosas: el filtro del monitor de entrega llama SUSPICIOUS a
   * `fraud_score >= 0.8` y NON_BILLABLE a lo demás.
   */
  async getDashboard(query: DashboardQueryDto): Promise<DashboardRow> {
    this.logger.debug({ query }, 'Loading admin ads dashboard');
    const rows = await this.campaignModel.sequelize!.query<DashboardRow>(
      `SELECT
        COALESCE((SELECT SUM(total_micros) FROM ad_invoices WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID')), 0)::text AS "revenueMicros",
        COALESCE((SELECT SUM(amount_micros) FROM ad_spend_ledger WHERE entry_type = 'CHARGE'), 0)::text AS "billableSpendMicros",
        (SELECT COUNT(*) FROM ad_campaigns WHERE status = 'ACTIVE')::text AS "activeCampaigns",
        (SELECT COUNT(*) FROM ad_moderation_reviews WHERE decision = 'PENDING_REVIEW')::text AS "pendingReviews",
        (SELECT COUNT(*) FROM ad_invoices WHERE status = 'OVERDUE')::text AS "overdueInvoices",
        -- Inválido es SOSPECHOSO, no «no facturable». Ver el comentario del método.
        (SELECT COUNT(*) FROM ad_events WHERE fraud_score >= 0.8)::text AS "invalidEvents",
        (SELECT COUNT(*) FROM ad_events)::text AS "totalEvents"`,
      { type: QueryTypes.SELECT },
    );
    return (
      rows[0] ?? {
        revenueMicros: '0',
        billableSpendMicros: '0',
        activeCampaigns: '0',
        pendingReviews: '0',
        overdueInvoices: '0',
        invalidEvents: '0',
        totalEvents: '0',
      }
    );
  }

  /**
   * Vistas, clicks, conversiones y gasto de una campaña, leídos del agregado diario.
   *
   * Se lee `ad_daily_metrics` y no `ad_events` a propósito: el detalle crece sin cota y un informe
   * que lo recorra entero se vuelve más lento cada día que pasa, justo en la pantalla que más se
   * abre. El agregado se escribe en la misma transacción que el evento, así que no hay ventana en
   * la que uno diga una cosa y el otro otra.
   *
   * El CTR no se calcula aquí: se devuelven los dos numeradores y el denominador, y quien pinte
   * decide. Un CTR servido como número redondeado esconde si el 50 % salió de dos impresiones.
   */
  async getCampaignPerformance(
    campaignId: string,
    query: CampaignPerformanceQueryDto,
  ): Promise<CampaignPerformanceRow[]> {
    const grouping = PERFORMANCE_GROUPING[query.groupBy];
    return this.campaignModel.sequelize!.query<CampaignPerformanceRow>(
      `SELECT
         ${grouping.expression} AS "bucket",
         ${grouping.labelExpression} AS "bucketLabel",
         COALESCE(SUM(metric.impressions), 0)::text AS "impressions",
         COALESCE(SUM(metric.clicks), 0)::text AS "clicks",
         COALESCE(SUM(metric.conversions), 0)::text AS "conversions",
         COALESCE(SUM(metric.billable_events), 0)::text AS "billableEvents",
         COALESCE(SUM(metric.spend_micros), 0)::text AS "spendMicros"
       FROM ad_daily_metrics metric
       LEFT JOIN ad_campaigns campaign ON campaign.id = metric.campaign_id
       LEFT JOIN ad_ad_sets ad_set ON ad_set.id = metric.ad_set_id
       LEFT JOIN ad_ads ad ON ad.id = metric.ad_id
       WHERE metric.campaign_id = :campaignId
         AND (:from::date IS NULL OR metric.metric_date >= :from::date)
         AND (:to::date IS NULL OR metric.metric_date <= :to::date)
       GROUP BY ${grouping.expression}${grouping.labelIsColumn ? `, ${grouping.labelExpression}` : ''}
       ORDER BY 1`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          campaignId,
          from: query.from ?? null,
          to: query.to ?? null,
        },
      },
    );
  }
}
