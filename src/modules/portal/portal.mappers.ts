import type {
  MerchantBranchModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import type { AdvertiserAccountModel, CampaignModel } from '../ads/models';
import { normalizeAmount } from '../../common/money/decimal-amount.util';

/**
 * Proyecciones explícitas del portal del comercio.
 *
 * Devolver el modelo Sequelize crudo expone toda la fila: `ad_advertiser_accounts` incluye NIT,
 * límite de crédito y estado de riesgo, que el portal no necesita y que no debe llegar al
 * navegador de un comercio. Además, un `SELECT *` acopla el contrato HTTP al esquema: cualquier
 * columna nueva se publicaría sin decisión explícita. Estos mapeadores son la única salida.
 */

export interface PortalPlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tier: string;
  monthlyPrice: string;
  /** Lo que cuesta llegar a 1.000 personas, en unidades de `currency`. */
  cpmPrice: string;
  /** Lo que cuesta un clic, en unidades de `currency`. */
  cpcPrice: string;
  currency: string;
  features: string[];
  status: string;
  sortOrder: number;
}

export interface PortalSubscriptionDto {
  id: string;
  merchantAccountId: string;
  planId: string;
  status: string;
  autoRenew: boolean;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  endedAt: string | null;
  plan: PortalPlanDto | null;
}

export interface PortalBranchDto {
  id: string;
  accountId: string;
  name: string;
  city: string | null;
  address: string | null;
  status: string;
  canOriginateBnpl: boolean;
  activatedAt: string | null;
}

export interface PortalAdvertiserDto {
  id: string;
  merchantAccountId: string | null;
  legalName: string;
  tradeName: string;
  status: string;
  billingMode: string;
  currency: string;
  city: string | null;
  businessCategory: string | null;
}

export interface PortalCampaignDto {
  id: string;
  advertiserId: string;
  name: string;
  objective: string;
  status: string;
  approvalStatus: string;
  currency: string;
  budgetTotalMicros: string;
  budgetDailyMicros: string | null;
  spendTotalMicros: string;
  startsAt: string | null;
  endsAt: string | null;
  /** `true` si el comercio puede alternarla ahora mismo; evita intentos condenados a 409. */
  toggleable: boolean;
}

export interface PortalInvoiceDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
}

export interface PortalReceivableDto {
  id: string;
  invoiceId: string | null;
  sourceType: string;
  amountOriginal: string;
  amountOpen: string;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  status: string;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return value;
}

/** BIGINT llega como `string` o `number` según el driver; se normaliza a `string` sin perder dígitos. */
function toBigIntString(value: unknown): string {
  if (value === null || value === undefined) return '0';
  return typeof value === 'string' ? value : String(value);
}

function toNullableBigIntString(value: unknown): string | null {
  return value === null || value === undefined ? null : toBigIntString(value);
}

function toFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function toPlanDto(plan: MerchantPlanModel): PortalPlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? null,
    tier: plan.tier,
    monthlyPrice: normalizeAmount(plan.monthlyPrice),
    /*
     * La tarifa sale en unidades de la moneda, no en micros: los micros existen para que el reparto
     * de un CPM entre mil impresiones no se redondee a cero, y ese calculo es del motor de entrega.
     * Quien lee esto es una pantalla de precios, y un precio con seis decimales no se lee.
     */
    cpmPrice: normalizeAmount(String(Number(plan.cpmMicros ?? 0) / 1_000_000)),
    cpcPrice: normalizeAmount(String(Number(plan.cpcMicros ?? 0) / 1_000_000)),
    currency: plan.currency,
    features: toFeatureList(plan.features),
    status: plan.status,
    sortOrder: Number(plan.sortOrder ?? 0),
  };
}

export function toSubscriptionDto(
  subscription: MerchantSubscriptionModel | null,
): PortalSubscriptionDto | null {
  if (!subscription) return null;
  return {
    id: subscription.id,
    merchantAccountId: subscription.merchantAccountId,
    planId: subscription.planId,
    status: subscription.status,
    autoRenew: Boolean(subscription.autoRenew),
    startedAt: toIsoString(subscription.startedAt),
    currentPeriodEnd: toIsoString(subscription.currentPeriodEnd),
    endedAt: toIsoString(subscription.endedAt),
    plan: subscription.plan ? toPlanDto(subscription.plan) : null,
  };
}

export function toBranchDto(branch: MerchantBranchModel): PortalBranchDto {
  return {
    id: branch.id,
    accountId: branch.accountId,
    name: branch.name,
    city: branch.city ?? null,
    address: branch.address ?? null,
    status: branch.status,
    canOriginateBnpl: Boolean(branch.canOriginateBnpl),
    activatedAt: toIsoString(branch.activatedAt),
  };
}

export function toAdvertiserDto(advertiser: AdvertiserAccountModel): PortalAdvertiserDto {
  return {
    id: advertiser.id,
    merchantAccountId: advertiser.merchantAccountId ?? null,
    legalName: advertiser.legalName,
    tradeName: advertiser.tradeName,
    status: advertiser.status,
    billingMode: advertiser.billingMode,
    currency: advertiser.currency,
    city: advertiser.city ?? null,
    businessCategory: advertiser.businessCategory ?? null,
  };
}

export function toCampaignDto(campaign: CampaignModel, toggleable: boolean): PortalCampaignDto {
  return {
    id: campaign.id,
    advertiserId: campaign.advertiserId,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    approvalStatus: campaign.approvalStatus,
    currency: campaign.currency,
    budgetTotalMicros: toBigIntString(campaign.budgetTotalMicros),
    budgetDailyMicros: toNullableBigIntString(campaign.budgetDailyMicros),
    spendTotalMicros: toBigIntString(campaign.spendTotalMicros),
    startsAt: toIsoString(campaign.startsAt),
    endsAt: toIsoString(campaign.endsAt),
    toggleable,
  };
}

export function toInvoiceDto(invoice: MerchantInvoiceModel): PortalInvoiceDto {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate ?? null,
    dueDate: invoice.dueDate ?? null,
    subtotalAmount: normalizeAmount(invoice.subtotalAmount),
    taxAmount: normalizeAmount(invoice.taxAmount),
    totalAmount: normalizeAmount(invoice.totalAmount),
    status: invoice.status,
  };
}

export function toReceivableDto(receivable: MerchantReceivableModel): PortalReceivableDto {
  return {
    id: receivable.id,
    invoiceId: receivable.invoiceId ?? null,
    sourceType: receivable.sourceType,
    amountOriginal: normalizeAmount(receivable.amountOriginal),
    amountOpen: normalizeAmount(receivable.amountOpen),
    currency: receivable.currency,
    issuedAt: toIsoString(receivable.issuedAt),
    dueDate: receivable.dueDate ?? null,
    status: receivable.status,
  };
}
