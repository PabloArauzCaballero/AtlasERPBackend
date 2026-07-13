import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  ApplyRecoveryPaymentDto,
  CompleteChecklistItemDto,
  BulkCreateAccountsDto,
  CreateAccountDto,
  CreateBranchDto,
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

  createOnboardingCase(input: CreateOnboardingCaseDto): Promise<Record<string, unknown>> {
    return this.onboardingService.createOnboardingCase(input);
  }

  createBranch(input: CreateBranchDto): Promise<Record<string, unknown>> {
    return this.onboardingService.createBranch(input);
  }

  createMerchantUser(input: CreateMerchantUserDto): Promise<Record<string, unknown>> {
    return this.onboardingService.createMerchantUser(input);
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

  registerPurchase(input: RegisterPurchaseDto): Promise<Record<string, unknown>> {
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
