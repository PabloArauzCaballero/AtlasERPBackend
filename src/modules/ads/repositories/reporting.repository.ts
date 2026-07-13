import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { PinoLogger } from 'nestjs-pino';
import { CampaignModel } from '../models';
import type { DashboardQueryDto } from '../ads.dtos';

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

  async getDashboard(query: DashboardQueryDto): Promise<DashboardRow> {
    this.logger.debug({ query }, 'Loading admin ads dashboard');
    const rows = await this.campaignModel.sequelize!.query<DashboardRow>(
      `SELECT
        COALESCE((SELECT SUM(total_micros) FROM ad_invoices WHERE status IN ('ISSUED','PARTIALLY_PAID','PAID')), 0)::text AS "revenueMicros",
        COALESCE((SELECT SUM(amount_micros) FROM ad_spend_ledger WHERE entry_type = 'CHARGE'), 0)::text AS "billableSpendMicros",
        (SELECT COUNT(*) FROM ad_campaigns WHERE status = 'ACTIVE')::text AS "activeCampaigns",
        (SELECT COUNT(*) FROM ad_moderation_reviews WHERE decision = 'PENDING_REVIEW')::text AS "pendingReviews",
        (SELECT COUNT(*) FROM ad_invoices WHERE status = 'OVERDUE')::text AS "overdueInvoices",
        (SELECT COUNT(*) FROM ad_events WHERE is_billable = false OR fraud_score >= 0.8)::text AS "invalidEvents",
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
}
