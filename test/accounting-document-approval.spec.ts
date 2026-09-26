import {
  assertCanDecide,
  assertClientApprovalStatus,
  assertDocumentApprovedForPosting,
} from '../src/modules/accounting/documents/domain/document-approval';

const codeOf = (fn: () => void): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return ((error as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
  }
};

describe('Aprobación del documento contable (ATL-03, dominio)', () => {
  it('el cliente sólo pide NOT_REQUIRED o PENDING', () => {
    expect(codeOf(() => assertClientApprovalStatus(undefined))).toBeUndefined();
    expect(codeOf(() => assertClientApprovalStatus('NOT_REQUIRED'))).toBeUndefined();
    expect(codeOf(() => assertClientApprovalStatus('PENDING'))).toBeUndefined();
    for (const status of ['APPROVED', 'REJECTED']) {
      expect(codeOf(() => assertClientApprovalStatus(status))).toBe(
        'ACCOUNTING_DOCUMENT_APPROVAL_NOT_CLIENT_SETTABLE',
      );
    }
  });

  it('publicar exige NOT_REQUIRED o APPROVED con aprobador', () => {
    expect(codeOf(() => assertDocumentApprovedForPosting({ approvalStatus: 'NOT_REQUIRED' }))).toBe(
      undefined,
    );
    expect(
      codeOf(() =>
        assertDocumentApprovedForPosting({ approvalStatus: 'APPROVED', approvedBy: 'u' }),
      ),
    ).toBeUndefined();
    for (const doc of [
      { approvalStatus: 'PENDING' },
      { approvalStatus: 'REJECTED' },
      { approvalStatus: 'APPROVED', approvedBy: null },
    ]) {
      expect(codeOf(() => assertDocumentApprovedForPosting(doc))).toBe(
        'ACCOUNTING_DOCUMENT_APPROVAL_REQUIRED',
      );
    }
  });

  it('nadie decide sobre lo suyo y sólo se decide un borrador PENDING', () => {
    const pending = { status: 'DRAFT', approvalStatus: 'PENDING', createdBy: 'creador' };
    expect(codeOf(() => assertCanDecide(pending, 'creador'))).toBe(
      'ACCOUNTING_DOCUMENT_SELF_APPROVAL_FORBIDDEN',
    );
    expect(codeOf(() => assertCanDecide(pending, 'otro'))).toBeUndefined();
    expect(codeOf(() => assertCanDecide({ ...pending, createdBy: null }, 'otro'))).toBeUndefined();
    expect(codeOf(() => assertCanDecide({ ...pending, status: 'POSTED' }, 'otro'))).toBe(
      'ACCOUNTING_DOCUMENT_NOT_PENDING_APPROVAL',
    );
    expect(codeOf(() => assertCanDecide({ ...pending, approvalStatus: 'APPROVED' }, 'otro'))).toBe(
      'ACCOUNTING_DOCUMENT_NOT_PENDING_APPROVAL',
    );
  });
});
