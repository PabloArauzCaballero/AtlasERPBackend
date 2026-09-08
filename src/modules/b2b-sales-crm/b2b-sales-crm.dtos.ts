import type { z } from 'zod';
import type {
  accountIdParamsSchema,
  applyRecoveryPaymentSchema,
  createAccountTagSchema,
  updateAccountTagSchema,
  createCrmSegmentSchema,
  updateCrmSegmentSchema,
  listCrmSegmentsQuerySchema,
  listBranchesQuerySchema,
  listOnboardingCasesQuerySchema,
  assignCaseContractSchema,
  createCaseMdrRuleSchema,
  createActivitySchema,
  updateActivitySchema,
  listActivitiesQuerySchema,
  listOpportunitiesQuerySchema,
  postMerchantInvoiceToGlSchema,
  ratingHistoryQuerySchema,
  ratingSweepSchema,
  completeChecklistItemSchema,
  contractIdParamsSchema,
  bulkCreateAccountsSchema,
  createAccountSchema,
  branchIdParamsSchema,
  createBranchSchema,
  createMdrRuleSchema,
  mdrRuleIdParamsSchema,
  mdrRulesQuerySchema,
  updateMdrRuleSchema,
  setBranchStatusSchema,
  updateBranchSchema,
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
  updateProposalSchema,
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
export type UpdateProposalDto = z.infer<typeof updateProposalSchema>;
export type DecideApprovalDto = z.infer<typeof decideApprovalSchema>;
export type RejectProposalDto = z.infer<typeof rejectProposalSchema>;
export type CreateContractFromProposalDto = z.infer<typeof createContractFromProposalSchema>;
export type SignContractDto = z.infer<typeof signContractSchema>;
export type CreateOnboardingCaseDto = z.infer<typeof createOnboardingCaseSchema>;
export type CreateBranchDto = z.infer<typeof createBranchSchema>;
export type CreateMdrRuleDto = z.infer<typeof createMdrRuleSchema>;
export type UpdateMdrRuleDto = z.infer<typeof updateMdrRuleSchema>;
export type MdrRuleIdParamsDto = z.infer<typeof mdrRuleIdParamsSchema>;
export type MdrRulesQueryDto = z.infer<typeof mdrRulesQuerySchema>;
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;
export type SetBranchStatusDto = z.infer<typeof setBranchStatusSchema>;
export type BranchIdParamsDto = z.infer<typeof branchIdParamsSchema>;
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
export type RatingHistoryQueryDto = z.infer<typeof ratingHistoryQuerySchema>;
export type RatingSweepDto = z.infer<typeof ratingSweepSchema>;
export type CreateAccountTagDto = z.infer<typeof createAccountTagSchema>;
export type UpdateAccountTagDto = z.infer<typeof updateAccountTagSchema>;
export type CreateCrmSegmentDto = z.infer<typeof createCrmSegmentSchema>;
export type UpdateCrmSegmentDto = z.infer<typeof updateCrmSegmentSchema>;
export type ListCrmSegmentsQueryDto = z.infer<typeof listCrmSegmentsQuerySchema>;
export type ListBranchesQueryDto = z.infer<typeof listBranchesQuerySchema>;
export type ListOnboardingCasesQueryDto = z.infer<typeof listOnboardingCasesQuerySchema>;
export type AssignCaseContractDto = z.infer<typeof assignCaseContractSchema>;
export type CreateCaseMdrRuleDto = z.infer<typeof createCaseMdrRuleSchema>;
