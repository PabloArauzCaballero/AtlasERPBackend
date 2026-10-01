import {
  ALL_MANUAL_POLICY_REF,
  SERVER_GENERATED_POLICY_REF,
  evaluateApprovalPolicy,
  resolveApprovalForCreation,
} from '../src/modules/accounting/documents/domain/approval-policy';
import { createAccountingDocumentSchema } from '../src/modules/accounting/shared/schemas/accounting.schemas';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return ((error as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
  }
};

const MANUAL = { origin: 'MANUAL' } as const;

describe('Política de aprobación decidida por el servidor (ATL-03 / DEC-10)', () => {
  describe('evaluateApprovalPolicy', () => {
    it('AP-08 sin política configurada un documento manual NO queda exento: UNAVAILABLE', () => {
      for (const configured of [undefined, '']) {
        expect(evaluateApprovalPolicy(MANUAL, configured).outcome).toBe('UNAVAILABLE');
      }
    });

    it('AP-08 una política desconocida o mal escrita tampoco exime', () => {
      for (const configured of [
        'NONE',
        'NOT_REQUIRED',
        'all_manual_require_approval',
        'ALL_MANUAL',
      ]) {
        expect(evaluateApprovalPolicy(MANUAL, configured).outcome).toBe('UNAVAILABLE');
      }
    });

    it('AP-04 con la política provisional todo documento manual EXIGE aprobación, con referencia', () => {
      const decision = evaluateApprovalPolicy(MANUAL, 'ALL_MANUAL_REQUIRE_APPROVAL');
      expect(decision).toMatchObject({ outcome: 'REQUIRED', policyRef: ALL_MANUAL_POLICY_REF });
    });

    it('AP-07 el documento que genera el servidor sí está exento, por una regla con referencia (no por cadena)', () => {
      for (const configured of [undefined, 'ALL_MANUAL_REQUIRE_APPROVAL']) {
        expect(evaluateApprovalPolicy({ origin: 'SERVER_GENERATED' }, configured)).toMatchObject({
          outcome: 'NOT_REQUIRED',
          policyRef: SERVER_GENERATED_POLICY_REF,
        });
      }
    });

    it('es determinista: mismos hechos y política, misma decisión', () => {
      const a = evaluateApprovalPolicy(MANUAL, 'ALL_MANUAL_REQUIRE_APPROVAL');
      const b = evaluateApprovalPolicy(MANUAL, 'ALL_MANUAL_REQUIRE_APPROVAL');
      expect(a).toEqual(b);
    });
  });

  describe('resolveApprovalForCreation', () => {
    const policy = 'ALL_MANUAL_REQUIRE_APPROVAL';

    it('AP-04 omitir approvalStatus es lo correcto: queda PENDING con la referencia de la política', () => {
      expect(resolveApprovalForCreation(MANUAL, policy, undefined)).toMatchObject({
        approvalStatus: 'PENDING',
        approvalPolicyRef: ALL_MANUAL_POLICY_REF,
      });
    });

    it('AP-04 pedir PENDING coincide con el servidor y se acepta', () => {
      expect(resolveApprovalForCreation(MANUAL, policy, 'PENDING').approvalStatus).toBe('PENDING');
    });

    it('AP-05 pedir NOT_REQUIRED NO obtiene la exención: se rechaza con 422, no se ignora en silencio', () => {
      expect(codeOf(() => resolveApprovalForCreation(MANUAL, policy, 'NOT_REQUIRED'))).toBe(
        'ACCOUNTING_DOCUMENT_APPROVAL_STATUS_CONTRADICTS_POLICY',
      );
    });

    it('AP-08 sin política el alta falla con un error controlado (409), con cualquier valor del body', () => {
      for (const requested of [undefined, 'NOT_REQUIRED', 'PENDING']) {
        expect(codeOf(() => resolveApprovalForCreation(MANUAL, undefined, requested))).toBe(
          'ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE',
        );
      }
    });

    it('AP-19 un origen declarado por el cliente (sourceSystem SYSTEM) no es el origen de la política', () => {
      // El origen sólo entra por `options.origin` del código que llama; el esquema HTTP no lo expone.
      const parsed = createAccountingDocumentSchema.parse({
        ...baseBody,
        sourceSystem: 'SYSTEM',
        sourceType: 'SERVER_GENERATED',
      });
      expect(Object.keys(parsed)).not.toContain('origin');
      expect(
        codeOf(() => resolveApprovalForCreation(MANUAL, undefined, parsed.approvalStatus)),
      ).toBe('ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE');
      expect(resolveApprovalForCreation(MANUAL, policy, parsed.approvalStatus).approvalStatus).toBe(
        'PENDING',
      );
    });
  });

  describe('contrato HTTP', () => {
    it('AP-04 approvalStatus ya no tiene valor por defecto NOT_REQUIRED', () => {
      expect(createAccountingDocumentSchema.parse(baseBody).approvalStatus).toBeUndefined();
    });

    it('AP-06 APPROVED y REJECTED siguen llegando al servicio para ser rechazados allí', () => {
      for (const approvalStatus of ['APPROVED', 'REJECTED']) {
        expect(
          createAccountingDocumentSchema.parse({ ...baseBody, approvalStatus }).approvalStatus,
        ).toBe(approvalStatus);
      }
    });
  });
});

const uuid = '00000000-0000-4000-8000-000000000001';
const baseBody = {
  legalEntityId: uuid,
  documentType: 'MANUAL',
  documentDate: '2026-07-01T00:00:00.000Z',
  currencyCode: 'BOB',
  lines: [
    { glAccountId: uuid, debit: 100, credit: 0, currencyCode: 'BOB', amountLc: 100 },
    { glAccountId: uuid, debit: 0, credit: 100, currencyCode: 'BOB', amountLc: 100 },
  ],
};
