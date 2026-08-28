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

// --- Alta de la cadena publicitaria y segmentación -------------------------------------------
// Viven al final y con sus propios imports porque son el contrato nuevo: separarlos deja claro,
// leyendo el archivo, qué existía antes de que el módulo supiera crear campañas.
import type {
  adSetIdParamSchema,
  campaignPerformanceQuerySchema,
  createAdSchema,
  createAdSetSchema,
  createCampaignSchema,
  createCreativeSchema,
  segmentIdParamSchema,
  submitCampaignForReviewSchema,
} from './ads.authoring.schemas';
import type {
  audienceContextSchema,
  createTargetSegmentSchema,
  listTargetSegmentsQuerySchema,
} from './ads.segmentation.schemas';

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type CreateAdSetDto = z.infer<typeof createAdSetSchema>;
export type CreateCreativeDto = z.infer<typeof createCreativeSchema>;
export type CreateAdDto = z.infer<typeof createAdSchema>;
export type AdSetIdParamDto = z.infer<typeof adSetIdParamSchema>;
export type SegmentIdParamDto = z.infer<typeof segmentIdParamSchema>;
export type CampaignPerformanceQueryDto = z.infer<typeof campaignPerformanceQuerySchema>;
export type CreateTargetSegmentDto = z.infer<typeof createTargetSegmentSchema>;
export type ListTargetSegmentsQueryDto = z.infer<typeof listTargetSegmentsQuerySchema>;
export type AudienceContextDto = z.infer<typeof audienceContextSchema>;
export type SubmitCampaignForReviewDto = z.infer<typeof submitCampaignForReviewSchema>;
