import { ActivationContractResolver } from './activation-contract.resolver';
import { KybVerificationService } from './kyb-verification.service';
import { MerchantActivationService } from './merchant-activation.service';
import { MerchantBranchesService } from './merchant-branches.service';
import { MerchantCredentialsReader } from './merchant-credentials.reader';
import { OnboardingCaseOpeningService } from './onboarding-case-opening.service';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { OnboardingChecklistService } from './onboarding-checklist.service';
import { OnboardingContractService } from './onboarding-contract.service';
import { OnboardingReconciliationService } from './onboarding-reconciliation.service';

/**
 * El tramo del Motor y el del portal, con AtlasBackend FINGIDO con la forma exacta que publica
 * (`decision.evaluatedAt`, `profile.decision` en `status`, `{items}` en la búsqueda).
 *
 * Estas rutas exigen la cookie upstream y contra un proceso local sólo se pueden llevar hasta el
 * 401; el desajuste de forma con AtlasBackend sólo aparecería en dev. Aquí se fija la forma que se
 * acordó, para que si allá cambia un nombre esto falle antes que la cola.
 */
export type Fila = Record<string, unknown> & { update: jest.Mock };
export const fila = (values: Record<string, unknown>): Fila => {
  const row: Fila = { ...values, update: jest.fn() };
  row.update.mockImplementation(async (patch: Record<string, unknown>) =>
    Object.assign(row, patch),
  );
  return row;
};

export const ACTOR = { sub: '1', role: 'ADMIN', email: 'a@b.c' } as never;
export const DECISION = {
  outcome: 'APROBADO',
  reason: 'KYB_COMPLETO',
  executionId: 'exec-77',
  artifactVersionId: 'v3',
  manualReviewCaseCode: null,
  evaluatedAt: '2026-09-09T12:00:00.000Z',
};

/** Lo que la compuerta del onboarding exige desde el 2026-10-02: el expediente capturado en la cuenta. */
export const EXPEDIENTE_COMPLETO = {
  commercialRegistry: '00008022',
  legalRepFullName: 'Pablo Arauz Caballero',
  legalRepDocumentType: 'ci',
  legalRepDocumentNumber: '1234567',
  powerOfAttorneyFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a11',
  address: 'Av. Banzer km 2 1/2',
  city: 'Santa Cruz',
  bankQrFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a12',
  bankInstitutionCode: 'BNB',
  bankAccountMasked: '****0739',
};

export function build(
  overrides: {
    caso?: Record<string, unknown>;
    users?: Fila[];
    forward?: jest.Mock;
    provisioning?: jest.Mock;
    folder?: jest.Mock;
  } = {},
) {
  const caso = fila({
    id: 'caso-1',
    accountId: 'acc-1',
    status: 'OPEN',
    contractVersionId: null,
    decisionOutcome: null,
    decisionExecutionId: null,
    manualReviewCaseCode: null,
    identityAcknowledgedAt: null,
    checklistItems: [],
    account: {
      id: 'acc-1',
      taxId: '123',
      partnerProfileId: 'p-9',
      update: jest.fn(),
      ...EXPEDIENTE_COMPLETO,
    },
    ...overrides.caso,
  });
  const users = overrides.users ?? [];
  const repository = {
    onboardingCases: {
      findByPk: jest.fn(async () => caso),
      findAll: jest.fn(async () => [caso]),
      update: jest.fn(),
    },
    merchantUsers: { findAll: jest.fn(async () => users) },
    contractVersions: { findOne: jest.fn(async () => null), findAll: jest.fn(async () => []) },
    contracts: {},
    checklistItems: {},
    contacts: { count: jest.fn(async () => 1) },
    accounts: {
      findByPk: jest.fn(async () => caso.account),
      update: jest.fn(async () => [1]),
    },
    findActiveContractVersion: jest.fn(async () => null),
    transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(undefined)),
  };
  const logger = { infoContext: jest.fn() };
  const identityClient = { getMerchantUserProvisioning: overrides.provisioning ?? jest.fn() };
  const logs = { record: jest.fn() };
  const partnerClient = { forward: overrides.forward ?? jest.fn() };
  const merchantFolder = {
    tryEnsureForAccount:
      overrides.folder ??
      jest.fn(async () => ({
        partnerId: 'p-9',
        expedienteId: 'e-1',
        created: false,
        reason: null,
      })),
  };
  const credentials = new MerchantCredentialsReader(repository as never);
  const activationContract = new ActivationContractResolver(repository as never);
  const caseQuery = new OnboardingCaseQueryService(
    repository as never,
    logger as never,
    credentials,
    activationContract,
  );
  const kyb = new KybVerificationService(
    repository as never,
    logger as never,
    logs as never,
    partnerClient as never,
    caseQuery,
  );
  const services = {
    caseQuery,
    kyb,
    opening: new OnboardingCaseOpeningService(
      repository as never,
      logger as never,
      merchantFolder as never,
      caseQuery,
    ),
    branches: new MerchantBranchesService(repository as never, logger as never),
    contracts: new OnboardingContractService(
      repository as never,
      logger as never,
      partnerClient as never,
      caseQuery,
      {} as never,
    ),
    reconciliation: new OnboardingReconciliationService(
      repository as never,
      logger as never,
      identityClient as never,
      logs as never,
      kyb,
      credentials,
    ),
    checklist: new OnboardingChecklistService(
      repository as never,
      logger as never,
      partnerClient as never,
      merchantFolder as never,
      caseQuery,
    ),
    activation: new MerchantActivationService(
      repository as never,
      logger as never,
      activationContract,
      caseQuery,
    ),
  };
  return { ...services, caso, repository, partnerClient, logs, identityClient, merchantFolder };
}
