import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AdvertiserAccountModel, CampaignModel } from '../../ads/models';
import { PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES } from '../portal.constants';

export function isCampaignToggleable(campaign: CampaignModel): boolean {
  return (PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES as readonly string[]).includes(campaign.status);
}

export function assertCampaignIsToggleable(campaign: CampaignModel): void {
  if (isCampaignToggleable(campaign)) return;
  throw new ConflictException({
    code: 'CAMPAIGN_NOT_TOGGLEABLE',
    message: 'Solo se pueden prender/apagar campañas ya lanzadas (activas o pausadas).',
  });
}

export function assertAdvertiserCanDeliver(advertiser: AdvertiserAccountModel | null): void {
  if (!advertiser) {
    throw new NotFoundException({
      code: 'ADVERTISER_NOT_FOUND',
      message: 'El anunciante de la campaña no existe.',
    });
  }
  if (advertiser.status !== 'ACTIVE') {
    throw new ForbiddenException({
      code: 'ADVERTISER_NOT_ACTIVE',
      message: `El anunciante está en estado ${advertiser.status} y no puede operar campañas.`,
    });
  }
  if (advertiser.riskStatus === 'BLOCKED') {
    throw new ForbiddenException({
      code: 'ADVERTISER_RISK_BLOCKED',
      message: 'El anunciante está bloqueado por riesgo. Contacta a tu ejecutivo comercial.',
    });
  }
}

export function assertCampaignCanResume(campaign: CampaignModel): void {
  const budgetTotal = BigInt(String(campaign.budgetTotalMicros ?? 0));
  const spendTotal = BigInt(String(campaign.spendTotalMicros ?? 0));
  if (budgetTotal > 0n && spendTotal >= budgetTotal) {
    throw new ConflictException({
      code: 'CAMPAIGN_BUDGET_EXHAUSTED',
      message: 'La campaña agotó su presupuesto total y no puede reactivarse.',
    });
  }

  if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now()) {
    throw new ConflictException({
      code: 'CAMPAIGN_SCHEDULE_EXPIRED',
      message: 'La campaña terminó su ventana de vigencia y no puede reactivarse.',
    });
  }
}
