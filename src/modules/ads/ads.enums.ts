export const ADS_ADMIN_ROLES = [
  'ADS_ADMIN_VIEWER',
  'ADS_ADMIN_MANAGER',
  'ADS_ADMIN_OPERATOR',
  'ADS_MODERATOR',
  'ADS_COMPLIANCE_ADMIN',
  'ADS_INVENTORY_MANAGER',
  'ADS_FINANCE',
  'ADS_AUDITOR',
  'ADS_OPS_MONITOR',
  'ADS_AD_SERVER',
  'ADS_EVENT_TRACKER',
  'ADS_SUPER_ADMIN',
] as const;

export type AdsAdminRole = (typeof ADS_ADMIN_ROLES)[number];

export const advertiserStatuses = ['PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
export const billingModes = ['PREPAID', 'POSTPAID'] as const;
export const riskStatuses = ['NORMAL', 'WATCHLIST', 'BLOCKED'] as const;
export const campaignStatuses = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'REJECTED',
  'ARCHIVED',
] as const;
export const approvalStatuses = [
  'NOT_SUBMITTED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
] as const;
export const campaignObjectives = [
  'AWARENESS',
  'TRAFFIC',
  'LEADS',
  'CONVERSIONS',
  'PROMOTION',
] as const;
export const buyingModels = ['CPM', 'CPC', 'CPA', 'FIXED'] as const;
export const creativeTypes = ['IMAGE', 'VIDEO', 'CAROUSEL', 'TEXT_CARD'] as const;
export const moderationDecisions = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'ESCALATED',
] as const;
export const eventTypes = ['IMPRESSION', 'CLICK', 'CONVERSION'] as const;
export const invoiceStatuses = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
] as const;
export const ledgerEntryTypes = ['CHARGE', 'CREDIT', 'ADJUSTMENT', 'REFUND', 'TAX'] as const;
export const policyRuleTypes = [
  'AUTO_REJECT',
  'MANUAL_REVIEW_REQUIRED',
  'WARNING',
  'BLOCK_DELIVERY',
] as const;
export const auditSeverities = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
