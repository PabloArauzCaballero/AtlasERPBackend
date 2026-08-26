import type {
  B2BAccountModel,
  B2BContactModel,
  BNPLPurchaseModel,
  CommercialProposalModel,
  ContractVersionModel,
  MerchantInvoiceModel,
  MerchantPayableModel,
  MerchantReceivableModel,
  ReconciliationRunModel,
  SalesOpportunityModel,
} from './models/b2b-sales-crm.models';

export function toAccountResponse(account: B2BAccountModel): Record<string, unknown> {
  return {
    id: account.id,
    legalName: account.legalName,
    tradeName: account.tradeName,
    taxId: account.taxId,
    accountType: account.accountType,
    industry: account.industry,
    category: account.category,
    businessLine: account.businessLine,
    businessDescription: account.businessDescription,
    websiteUrl: account.websiteUrl,
    countryCode: account.countryCode,
    city: account.city,
    address: account.address,
    employeeCount: account.employeeCount,
    foundedYear: account.foundedYear,
    annualRevenue: account.annualRevenue,
    tags: account.tags?.map((tag) => tag.name) ?? [],
    lifecycleStatus: account.lifecycleStatus,
    ownerUserId: account.ownerUserId,
    territoryId: account.territoryId,
    riskTier: account.riskTier,
    expectedMonthlyVolume: account.expectedMonthlyVolume,
    archivedAt: account.archivedAt ?? null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function toContactResponse(contact: B2BContactModel): Record<string, unknown> {
  return {
    id: contact.id,
    accountId: contact.accountId,
    fullName: contact.fullName,
    roleTitle: contact.roleTitle,
    email: contact.email,
    phone: contact.phone,
    decisionRole: contact.decisionRole,
    isPrimary: contact.isPrimary,
    status: contact.status,
  };
}

export function toOpportunityResponse(opportunity: SalesOpportunityModel): Record<string, unknown> {
  return {
    id: opportunity.id,
    accountId: opportunity.accountId,
    ownerUserId: opportunity.ownerUserId,
    name: opportunity.name,
    opportunityType: opportunity.opportunityType,
    stage: opportunity.stage,
    expectedMonthlyVolume: opportunity.expectedMonthlyVolume,
    expectedMdrRate: opportunity.expectedMdrRate,
    expectedMonthlyRevenue: opportunity.expectedMonthlyRevenue,
    probability: opportunity.probability,
    expectedCloseDate: opportunity.expectedCloseDate,
    lossReason: opportunity.lossReason,
  };
}

export function toProposalResponse(proposal: CommercialProposalModel): Record<string, unknown> {
  return {
    id: proposal.id,
    opportunityId: proposal.opportunityId,
    accountId: proposal.accountId,
    proposalNumber: proposal.proposalNumber,
    status: proposal.status,
    validUntil: proposal.validUntil,
    totalEstimatedMonthlyRevenue: proposal.totalEstimatedMonthlyRevenue,
    sentAt: proposal.sentAt,
    acceptedAt: proposal.acceptedAt,
    rejectedAt: proposal.rejectedAt,
    lines: proposal.lines?.map((line) => ({
      id: line.id,
      termType: line.termType,
      description: line.description,
      ratePercent: line.ratePercent,
      fixedAmount: line.fixedAmount,
      currency: line.currency,
      billingTiming: line.billingTiming,
    })),
  };
}

export function toContractVersionResponse(version: ContractVersionModel): Record<string, unknown> {
  return {
    id: version.id,
    contractId: version.contractId,
    versionNumber: version.versionNumber,
    validFrom: version.validFrom,
    validTo: version.validTo,
    status: version.status,
    approvedByUserId: version.approvedByUserId,
    approvedAt: version.approvedAt,
  };
}

export function toPurchaseResponse(purchase: BNPLPurchaseModel): Record<string, unknown> {
  return {
    id: purchase.id,
    merchantAccountId: purchase.merchantAccountId,
    branchId: purchase.branchId,
    consumerId: purchase.consumerId,
    contractVersionId: purchase.contractVersionId,
    purchaseAmount: purchase.purchaseAmount,
    downPaymentAmount: purchase.downPaymentAmount,
    financedAmount: purchase.financedAmount,
    riskTierAtOrigination: purchase.riskTierAtOrigination,
    cohortId: purchase.cohortId,
    status: purchase.status,
    purchaseDate: purchase.purchaseDate,
    installments: purchase.installments?.map((installment) => ({
      id: installment.id,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      amount: installment.amount,
      status: installment.status,
    })),
  };
}

export function toReceivableResponse(receivable: MerchantReceivableModel): Record<string, unknown> {
  return {
    id: receivable.id,
    accountId: receivable.accountId,
    invoiceId: receivable.invoiceId,
    sourceType: receivable.sourceType,
    sourceId: receivable.sourceId,
    amountOriginal: receivable.amountOriginal,
    amountOpen: receivable.amountOpen,
    currency: receivable.currency,
    dueDate: receivable.dueDate,
    status: receivable.status,
  };
}

export function toInvoiceResponse(invoice: MerchantInvoiceModel): Record<string, unknown> {
  return {
    id: invoice.id,
    accountId: invoice.accountId,
    contractId: invoice.contractId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    subtotalAmount: invoice.subtotalAmount,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    status: invoice.status,
    externalTaxRef: invoice.externalTaxRef,
    lines: invoice.lines?.map((line) => ({
      id: line.id,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      taxAmount: line.taxAmount,
      totalAmount: line.totalAmount,
    })),
  };
}

export function toPayableResponse(payable: MerchantPayableModel): Record<string, unknown> {
  return {
    id: payable.id,
    accountId: payable.accountId,
    purchaseId: payable.purchaseId,
    installmentId: payable.installmentId,
    reason: payable.reason,
    amount: payable.amount,
    scheduledPaymentDate: payable.scheduledPaymentDate,
    paidAt: payable.paidAt,
    status: payable.status,
  };
}

export function toReconciliationRunResponse(run: ReconciliationRunModel): Record<string, unknown> {
  return {
    id: run.id,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    startedByUserId: run.startedByUserId,
    completedAt: run.completedAt,
    items: run.items?.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      severity: item.severity,
      accountId: item.accountId,
      sourceRef: item.sourceRef,
      description: item.description,
      status: item.status,
    })),
  };
}
