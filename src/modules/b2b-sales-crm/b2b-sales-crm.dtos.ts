import type { z } from 'zod';
import type {
  accountIdParamsSchema,
  applyRecoveryPaymentSchema,
  createActivitySchema,
  updateActivitySchema,
  listActivitiesQuerySchema,
  listOpportunitiesQuerySchema,
  postMerchantInvoiceToGlSchema,
  completeChecklistItemSchema,
  contractIdParamsSchema,
  bulkCreateAccountsSchema,
  createAccountSchema,
  createBranchSchema,
  createContactSchema,
  createContractFromProposalSchema,
  createMerchantUserSchema,
  createOnboardingCaseSchema,
  createOpportunitySchema,
  createProposalSchema,
  decideApprovalSchema,
  idParamsSchema,
  issueInvoiceSchema,
  listAccountsQuerySchema,
  markPayablePaidSchema,
  moveOpportunityStageSchema,
  onboardingCaseIdParamsSchema,
  payableIdParamsSchema,
  proposalIdParamsSchema,
  qualifyAccountSchema,
  recoveryIdParamsSchema,
  registerMerchantPaymentSchema,
  registerPurchaseSchema,
  rejectProposalSchema,
  runReconciliationSchema,
  scheduleCoverageSchema,
  signContractSchema,
} from './b2b-sales-crm.schemas';

export type IdParamsDto = z.infer<typeof idParamsSchema>;
export type AccountIdParamsDto = z.infer<typeof accountIdParamsSchema>;
export type ProposalIdParamsDto = z.infer<typeof proposalIdParamsSchema>;
export type ContractIdParamsDto = z.infer<typeof contractIdParamsSchema>;
export type OnboardingCaseIdParamsDto = z.infer<typeof onboardingCaseIdParamsSchema>;
export type PayableIdParamsDto = z.infer<typeof payableIdParamsSchema>;
export type RecoveryIdParamsDto = z.infer<typeof recoveryIdParamsSchema>;
export type ListAccountsQueryDto = z.infer<typeof listAccountsQuerySchema>;
export type BulkCreateAccountsDto = z.infer<typeof bulkCreateAccountsSchema>;
export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type QualifyAccountDto = z.infer<typeof qualifyAccountSchema>;
export type CreateContactDto = z.infer<typeof createContactSchema>;
export type CreateOpportunityDto = z.infer<typeof createOpportunitySchema>;
export type ListOpportunitiesQueryDto = z.infer<typeof listOpportunitiesQuerySchema>;
export type MoveOpportunityStageDto = z.infer<typeof moveOpportunityStageSchema>;
export type CreateProposalDto = z.infer<typeof createProposalSchema>;
export type DecideApprovalDto = z.infer<typeof decideApprovalSchema>;
export type RejectProposalDto = z.infer<typeof rejectProposalSchema>;
export type CreateContractFromProposalDto = z.infer<typeof createContractFromProposalSchema>;
export type SignContractDto = z.infer<typeof signContractSchema>;
export type CreateOnboardingCaseDto = z.infer<typeof createOnboardingCaseSchema>;
export type CreateBranchDto = z.infer<typeof createBranchSchema>;
export type CreateMerchantUserDto = z.infer<typeof createMerchantUserSchema>;
export type CompleteChecklistItemDto = z.infer<typeof completeChecklistItemSchema>;
export type RegisterPurchaseDto = z.infer<typeof registerPurchaseSchema>;
export type IssueInvoiceDto = z.infer<typeof issueInvoiceSchema>;
export type RegisterMerchantPaymentDto = z.infer<typeof registerMerchantPaymentSchema>;
export type ScheduleCoverageDto = z.infer<typeof scheduleCoverageSchema>;
export type MarkPayablePaidDto = z.infer<typeof markPayablePaidSchema>;
export type ApplyRecoveryPaymentDto = z.infer<typeof applyRecoveryPaymentSchema>;
export type RunReconciliationDto = z.infer<typeof runReconciliationSchema>;
export type CreateActivityDto = z.infer<typeof createActivitySchema>;
export type UpdateActivityDto = z.infer<typeof updateActivitySchema>;
export type ListActivitiesQueryDto = z.infer<typeof listActivitiesQuerySchema>;
export type PostMerchantInvoiceToGlDto = z.infer<typeof postMerchantInvoiceToGlSchema>;
