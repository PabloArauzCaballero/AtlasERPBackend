import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  ApplyRecoveryPaymentDto,
  CompleteChecklistItemDto,
  BulkCreateAccountsDto,
  CreateAccountDto,
  CreateBranchDto,
  CreateMdrRuleDto,
  UpdateMdrRuleDto,
  SetBranchStatusDto,
  UpdateBranchDto,
  CreateContactDto,
  CreateContractFromProposalDto,
  CreateMerchantUserDto,
  CreateOnboardingCaseDto,
  CreateOpportunityDto,
  CreateProposalDto,
  DecideApprovalDto,
  IssueInvoiceDto,
  ListAccountsQueryDto,
  ListOpportunitiesQueryDto,
  MarkPayablePaidDto,
  MoveOpportunityStageDto,
  QualifyAccountDto,
  RegisterMerchantPaymentDto,
  RegisterPurchaseDto,
  RejectProposalDto,
  RunReconciliationDto,
  ScheduleCoverageDto,
  SignContractDto,
  UpdateProposalDto,
  ListOnboardingCasesQueryDto,
  AssignCaseContractDto,
  CreateCaseMdrRuleDto,
  RequestKybReviewDto,
} from '../b2b-sales-crm.dtos';
import { B2BAccountsService } from './b2b-accounts.service';
import { B2BBnplBillingService } from './b2b-bnpl-billing.service';
import { B2BContractsService } from './b2b-contracts.service';
import { B2BCoverageService } from './b2b-coverage.service';
import { B2BOnboardingService } from './b2b-onboarding.service';
import { B2BPipelineService } from './b2b-pipeline.service';
import { B2BReconciliationService } from './b2b-reconciliation.service';

@Injectable()
export class B2BSalesCrmService {
  constructor(
    private readonly accountsService: B2BAccountsService,
    private readonly pipelineService: B2BPipelineService,
    private readonly contractsService: B2BContractsService,
    private readonly onboardingService: B2BOnboardingService,
    private readonly bnplBillingService: B2BBnplBillingService,
    private readonly coverageService: B2BCoverageService,
    private readonly reconciliationService: B2BReconciliationService,
  ) {}

  createAccount(input: CreateAccountDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.accountsService.createAccount(input, user);
  }

  listAccounts(query: ListAccountsQueryDto): Promise<Record<string, unknown>> {
    return this.accountsService.listAccounts(query);
  }

  bulkCreateAccounts(
    input: BulkCreateAccountsDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.accountsService.bulkCreateAccounts(input, user);
  }

  getAccount(id: string): Promise<Record<string, unknown>> {
    return this.accountsService.getAccount(id);
  }

  archiveAccount(accountId: string, user: AuthUser): Promise<Record<string, unknown>> {
    return this.accountsService.archiveAccount(accountId, user);
  }

  restoreAccount(accountId: string, user: AuthUser): Promise<Record<string, unknown>> {
    return this.accountsService.restoreAccount(accountId, user);
  }

  createContact(accountId: string, input: CreateContactDto): Promise<Record<string, unknown>> {
    return this.accountsService.createContact(accountId, input);
  }

  qualifyAccount(
    accountId: string,
    input: QualifyAccountDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.accountsService.qualifyAccount(accountId, input, user);
  }

  createOpportunity(input: CreateOpportunityDto): Promise<Record<string, unknown>> {
    return this.pipelineService.createOpportunity(input);
  }

  listOpportunities(query: ListOpportunitiesQueryDto): Promise<Record<string, unknown>[]> {
    return this.pipelineService.listOpportunities(query);
  }

  moveOpportunityStage(
    id: string,
    input: MoveOpportunityStageDto,
  ): Promise<Record<string, unknown>> {
    return this.pipelineService.moveOpportunityStage(id, input);
  }

  createProposal(input: CreateProposalDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.pipelineService.createProposal(input, user);
  }

  updateProposal(proposalId: string, input: UpdateProposalDto): Promise<Record<string, unknown>> {
    return this.pipelineService.updateProposal(proposalId, input);
  }

  deleteProposal(proposalId: string): Promise<{ id: string; proposalNumber: string }> {
    return this.pipelineService.deleteProposal(proposalId);
  }

  sendProposal(proposalId: string): Promise<Record<string, unknown>> {
    return this.pipelineService.sendProposal(proposalId);
  }

  acceptProposal(proposalId: string): Promise<Record<string, unknown>> {
    return this.pipelineService.acceptProposal(proposalId);
  }

  rejectProposal(proposalId: string, input: RejectProposalDto): Promise<Record<string, unknown>> {
    return this.pipelineService.rejectProposal(proposalId, input);
  }

  decideApproval(
    approvalId: string,
    input: DecideApprovalDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.pipelineService.decideApproval(approvalId, input, user);
  }

  createContractFromProposal(
    input: CreateContractFromProposalDto,
  ): Promise<Record<string, unknown>> {
    return this.contractsService.createContractFromProposal(input);
  }

  signAndActivateContract(
    contractId: string,
    input: SignContractDto,
  ): Promise<Record<string, unknown>> {
    return this.contractsService.signAndActivateContract(contractId, input);
  }

  listInstallments(): Promise<Record<string, unknown>[]> {
    return this.reconciliationService.listInstallments();
  }

  listCommissions(accountId: string): Promise<Record<string, unknown>> {
    return this.reconciliationService.listCommissions(accountId);
  }

  listMerchantInvoices(): Promise<Record<string, unknown>[]> {
    return this.reconciliationService.listMerchantInvoices();
  }

  getMerchantInvoice(id: string): Promise<Record<string, unknown>> {
    return this.reconciliationService.getMerchantInvoice(id);
  }

  listPayables(): Promise<Record<string, unknown>[]> {
    return this.reconciliationService.listPayables();
  }

  listRecoveries(): Promise<Record<string, unknown>[]> {
    return this.reconciliationService.listRecoveries();
  }

  listProposals(): Promise<Record<string, unknown>[]> {
    return this.pipelineService.listProposals();
  }

  listApprovals(onlyPending?: boolean): Promise<Record<string, unknown>[]> {
    return this.pipelineService.listApprovals(onlyPending);
  }

  listMdrRules(contractVersionId?: string): Promise<Record<string, unknown>[]> {
    return this.contractsService.listMdrRules(contractVersionId);
  }

  createMdrRule(input: CreateMdrRuleDto): Promise<Record<string, unknown>> {
    return this.contractsService.createMdrRule(input);
  }

  updateMdrRule(ruleId: string, input: UpdateMdrRuleDto): Promise<Record<string, unknown>> {
    return this.contractsService.updateMdrRule(ruleId, input);
  }

  listContracts(): Promise<Record<string, unknown>[]> {
    return this.pipelineService.listContracts();
  }

  listOnboardingCases(query: ListOnboardingCasesQueryDto): Promise<Record<string, unknown>> {
    return this.onboardingService.listOnboardingCases(query);
  }

  summarizeOnboardingQueue(): Promise<Record<string, unknown>> {
    return this.onboardingService.summarizeOnboardingQueue();
  }

  linkPartnerProfile(onboardingCaseId: string, accessToken: string): Promise<Record<string, unknown>> {
    return this.onboardingService.linkPartnerProfile(onboardingCaseId, accessToken);
  }

  requestKybReview(
    onboardingCaseId: string,
    input: RequestKybReviewDto,
    accessToken: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.requestKybReview(onboardingCaseId, input, accessToken, actor);
  }

  syncKybDecision(onboardingCaseId: string, accessToken: string): Promise<Record<string, unknown>> {
    return this.onboardingService.syncKybDecision(onboardingCaseId, accessToken);
  }

  reconcilePendingCases(accessToken: string, actor: AuthUser): Promise<Record<string, unknown>> {
    return this.onboardingService.reconcilePendingCases(accessToken, actor);
  }

  reconcileCaseIdentity(
    onboardingCaseId: string,
    accessToken: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.reconcileCaseIdentity(onboardingCaseId, accessToken, actor);
  }

  listCaseContractOptions(onboardingCaseId: string): Promise<Record<string, unknown>[]> {
    return this.onboardingService.listCaseContractOptions(onboardingCaseId);
  }

  assignCaseContract(
    onboardingCaseId: string,
    input: AssignCaseContractDto,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.assignCaseContract(onboardingCaseId, input);
  }

  /**
   * La comisión del alta cuelga del contrato DEL CASO: se resuelve aquí y se crea con la misma
   * regla que cualquier otra regla de comisión, para que no haya dos formas de pactarla.
   */
  async createCaseMdrRule(
    onboardingCaseId: string,
    input: CreateCaseMdrRuleDto,
  ): Promise<Record<string, unknown>> {
    const contractVersionId = await this.onboardingService.requireCaseContractVersionId(onboardingCaseId);
    return this.contractsService.createMdrRule({ ...input, contractVersionId });
  }

  getOnboardingCase(onboardingCaseId: string): Promise<Record<string, unknown>> {
    return this.onboardingService.getOnboardingCase(onboardingCaseId);
  }

  createOnboardingCase(input: CreateOnboardingCaseDto): Promise<Record<string, unknown>> {
    return this.onboardingService.createOnboardingCase(input);
  }

  listBranches(filtro: {
    accountId?: string | undefined;
    status?: string | undefined;
  }): Promise<Record<string, unknown>[]> {
    return this.onboardingService.listBranches(filtro);
  }

  createBranch(input: CreateBranchDto): Promise<Record<string, unknown>> {
    return this.onboardingService.createBranch(input);
  }

  updateBranch(branchId: string, input: UpdateBranchDto): Promise<Record<string, unknown>> {
    return this.onboardingService.updateBranch(branchId, input);
  }

  setBranchStatus(branchId: string, input: SetBranchStatusDto): Promise<Record<string, unknown>> {
    return this.onboardingService.setBranchStatus(branchId, input);
  }

  createMerchantUser(
    input: CreateMerchantUserDto,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.createMerchantUser(input, accessToken);
  }

  syncMerchantUserIdentity(
    merchantUserId: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.syncMerchantUserIdentity(merchantUserId, accessToken);
  }

  completeChecklistItem(
    onboardingCaseId: string,
    input: CompleteChecklistItemDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.onboardingService.completeChecklistItem(onboardingCaseId, input, user);
  }

  activateOnboardingCase(onboardingCaseId: string): Promise<Record<string, unknown>> {
    return this.onboardingService.activateOnboardingCase(onboardingCaseId);
  }

  registerPurchase(
    input: RegisterPurchaseDto & { merchantAccountId: string },
  ): Promise<Record<string, unknown>> {
    return this.bnplBillingService.registerPurchase(input);
  }

  issueInvoice(input: IssueInvoiceDto): Promise<Record<string, unknown>> {
    return this.bnplBillingService.issueInvoice(input);
  }

  registerMerchantPayment(input: RegisterMerchantPaymentDto): Promise<Record<string, unknown>> {
    return this.bnplBillingService.registerMerchantPayment(input);
  }

  scheduleCoverage(input: ScheduleCoverageDto): Promise<Record<string, unknown>> {
    return this.coverageService.scheduleCoverage(input);
  }

  markPayablePaid(payableId: string, input: MarkPayablePaidDto): Promise<Record<string, unknown>> {
    return this.coverageService.markPayablePaid(payableId, input);
  }

  applyRecoveryPayment(
    recoveryId: string,
    input: ApplyRecoveryPaymentDto,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.applyRecoveryPayment(recoveryId, input);
  }

  runReconciliation(input: RunReconciliationDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.reconciliationService.runReconciliation(input, user);
  }
}
