import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  ApplyRecoveryPaymentDto,
  CancelPayableDto,
  DecidePayableSettlementDto,
  RejectPayableSettlementDto,
  ResolveCoverageReviewItemDto,
  ReviewQueueQueryDto,
  ReverseRecoveryMovementDto,
  BulkCreateAccountsDto,
  CreateAccountDto,
  SetAccountTaxIdDto,
  SetAccountDossierDto,
  CreateMdrRuleDto,
  UpdateMdrRuleDto,
  CreateContactDto,
  CreateContractFromProposalDto,
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
  SendProposalDto,
  RunReconciliationDto,
  ScheduleCoverageDto,
  SignContractDto,
  UpdateProposalDto,
} from '../b2b-sales-crm.dtos';
import { B2BAccountsService } from './b2b-accounts.service';
import { B2BBnplBillingService } from './b2b-bnpl-billing.service';
import { B2BContractsService } from './b2b-contracts.service';
import { B2BCoverageService } from './b2b-coverage.service';
import { B2BOverdueSweepService } from './b2b-overdue-sweep.service';
import type { OverdueSweepResult } from './b2b-overdue-sweep.service';
import { B2BPipelineService } from './b2b-pipeline.service';
import { B2BReconciliationService } from './b2b-reconciliation.service';
import { B2BCoverageReviewService } from './coverage-review.service';
import { ProposalDeliveryService } from './proposal-delivery.service';
import { ProposalPdfService } from './proposal-pdf.service';
import type { GeneratedPdf } from '../../documents/documents.service';

@Injectable()
export class B2BSalesCrmService {
  constructor(
    private readonly accountsService: B2BAccountsService,
    private readonly pipelineService: B2BPipelineService,
    private readonly contractsService: B2BContractsService,
    private readonly bnplBillingService: B2BBnplBillingService,
    private readonly coverageService: B2BCoverageService,
    private readonly overdueSweepService: B2BOverdueSweepService,
    private readonly reconciliationService: B2BReconciliationService,
    private readonly coverageReviewService: B2BCoverageReviewService,
    private readonly proposalDelivery: ProposalDeliveryService,
    private readonly proposalPdfService: ProposalPdfService,
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

  setAccountTaxId(
    accountId: string,
    input: SetAccountTaxIdDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.accountsService.setAccountTaxId(accountId, input, user);
  }

  setAccountDossier(
    accountId: string,
    input: SetAccountDossierDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.accountsService.setAccountDossier(accountId, input, user);
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
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.pipelineService.moveOpportunityStage(id, input, user);
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

  async proposalPdf(proposalId: string, user: AuthUser): Promise<GeneratedPdf> {
    return this.proposalPdfService.pdfById(proposalId, await this.proposalDelivery.senderOf(user));
  }

  listProposalRecipients(proposalId: string): Promise<Record<string, unknown>[]> {
    return this.proposalDelivery.recipients(proposalId);
  }

  sendProposal(
    proposalId: string,
    input: SendProposalDto,
    user: AuthUser,
    atlasToken: string | undefined,
  ): Promise<Record<string, unknown>> {
    return this.proposalDelivery.send(proposalId, input, user, atlasToken);
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
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.contractsService.signAndActivateContract(contractId, input, user);
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

  listPayables(user?: AuthUser): Promise<Record<string, unknown>[]> {
    return this.reconciliationService.listPayables(user?.sub);
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

  createMdrRule(input: CreateMdrRuleDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.contractsService.createMdrRule(input, user);
  }

  updateMdrRule(
    ruleId: string,
    input: UpdateMdrRuleDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.contractsService.updateMdrRule(ruleId, input, user);
  }

  listContracts(): Promise<Record<string, unknown>[]> {
    return this.pipelineService.listContracts();
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

  /** Marca OVERDUE las cuotas vencidas sin pago, a demanda (la pasada periódica corre sola). */
  sweepOverdueInstallments(): Promise<OverdueSweepResult> {
    return this.overdueSweepService.sweep();
  }

  scheduleCoverage(input: ScheduleCoverageDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.coverageService.scheduleCoverage(input, { userId: user.sub });
  }

  cancelPayable(
    payableId: string,
    input: CancelPayableDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.cancelPayable(payableId, input, { userId: user.sub });
  }

  listCoverageReviewQueue(
    user: AuthUser,
    query?: ReviewQueueQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.coverageReviewService.listReviewQueue({ userId: user.sub }, query);
  }

  resolveCoverageReviewItem(
    reviewItemId: string,
    input: ResolveCoverageReviewItemDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageReviewService.resolveReviewItem(reviewItemId, input, {
      userId: user.sub,
    });
  }

  markPayablePaid(
    payableId: string,
    input: MarkPayablePaidDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.markPayablePaid(payableId, input, { userId: user.sub });
  }

  approvePayableSettlement(
    payableId: string,
    input: DecidePayableSettlementDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.approvePayableSettlement(payableId, input, { userId: user.sub });
  }

  rejectPayableSettlement(
    payableId: string,
    input: RejectPayableSettlementDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.rejectPayableSettlement(payableId, input, { userId: user.sub });
  }

  applyRecoveryPayment(
    recoveryId: string,
    input: ApplyRecoveryPaymentDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.applyRecoveryPayment(recoveryId, input, { userId: user.sub });
  }

  reverseRecoveryMovement(
    recoveryId: string,
    movementId: string,
    input: ReverseRecoveryMovementDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.coverageService.reverseRecoveryMovement(recoveryId, movementId, input, {
      userId: user.sub,
    });
  }

  listRecoveryMovements(recoveryId: string): Promise<Record<string, unknown>[]> {
    return this.coverageService.listRecoveryMovements(recoveryId);
  }

  runReconciliation(input: RunReconciliationDto, user: AuthUser): Promise<Record<string, unknown>> {
    return this.reconciliationService.runReconciliation(input, user);
  }
}
