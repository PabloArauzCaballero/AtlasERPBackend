import type { z } from 'zod';
import type {
  auditQuerySchema,
  bulkCreateAdvertisersSchema,
  bulkTrackEventsSchema,
  campaignIdParamSchema,
  createAdvertiserSchema,
  createBillingProfileSchema,
  createInventoryPlacementSchema,
  createPolicyRuleSchema,
  dashboardQuerySchema,
  deliveryMonitorQuerySchema,
  deliveryRequestSchema,
  eventIdParamSchema,
  invoiceIdParamSchema,
  listAdvertisersQuerySchema,
  listCampaignsQuerySchema,
  listInventoryQuerySchema,
  listPoliciesQuerySchema,
  moderationDecisionSchema,
  moderationQueueQuerySchema,
  periodCloseSchema,
  registerPaymentSchema,
  reviewIdParamSchema,
  trackEventSchema,
  updateAdvertiserStatusSchema,
  updateBillableStatusSchema,
  updateCampaignStatusSchema,
  advertiserIdParamSchema,
} from './ads.schemas';

export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;
export type AdvertiserIdParamDto = z.infer<typeof advertiserIdParamSchema>;
export type ListAdvertisersQueryDto = z.infer<typeof listAdvertisersQuerySchema>;
export type CreateAdvertiserDto = z.infer<typeof createAdvertiserSchema>;
export type CreateBillingProfileDto = z.infer<typeof createBillingProfileSchema>;
export type UpdateAdvertiserStatusDto = z.infer<typeof updateAdvertiserStatusSchema>;
export type CampaignIdParamDto = z.infer<typeof campaignIdParamSchema>;
export type ListCampaignsQueryDto = z.infer<typeof listCampaignsQuerySchema>;
export type UpdateCampaignStatusDto = z.infer<typeof updateCampaignStatusSchema>;
export type ModerationQueueQueryDto = z.infer<typeof moderationQueueQuerySchema>;
export type ReviewIdParamDto = z.infer<typeof reviewIdParamSchema>;
export type ModerationDecisionDto = z.infer<typeof moderationDecisionSchema>;
export type ListInventoryQueryDto = z.infer<typeof listInventoryQuerySchema>;
export type CreateInventoryPlacementDto = z.infer<typeof createInventoryPlacementSchema>;
export type ListPoliciesQueryDto = z.infer<typeof listPoliciesQuerySchema>;
export type CreatePolicyRuleDto = z.infer<typeof createPolicyRuleSchema>;
export type PeriodCloseDto = z.infer<typeof periodCloseSchema>;
export type InvoiceIdParamDto = z.infer<typeof invoiceIdParamSchema>;
export type RegisterPaymentDto = z.infer<typeof registerPaymentSchema>;
export type DeliveryMonitorQueryDto = z.infer<typeof deliveryMonitorQuerySchema>;
export type EventIdParamDto = z.infer<typeof eventIdParamSchema>;
export type UpdateBillableStatusDto = z.infer<typeof updateBillableStatusSchema>;
export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
export type BulkCreateAdvertisersDto = z.infer<typeof bulkCreateAdvertisersSchema>;
export type BulkTrackEventsDto = z.infer<typeof bulkTrackEventsSchema>;
export type DeliveryRequestDto = z.infer<typeof deliveryRequestSchema>;
export type TrackEventDto = z.infer<typeof trackEventSchema>;
