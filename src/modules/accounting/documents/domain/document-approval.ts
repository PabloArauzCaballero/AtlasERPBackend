import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Aprobación del documento contable decidida por el SERVIDOR (ATL-03 / DEC-10).
 *
 * La necesidad de aprobación la fija `approval-policy.ts` al crear el borrador (con referencia de la
 * política en `approval_policy_ref`); el body ya no la decide. Máquina de estados:
 *
 *   alta (política exige)   DRAFT · PENDING ──approve (actor ≠ creador)──▶ DRAFT · APPROVED ──post──▶ POSTED
 *                           DRAFT · PENDING ──reject  (actor ≠ creador)──▶ DRAFT · REJECTED (terminal)
 *   alta (política exime)   DRAFT · NOT_REQUIRED (con referencia de política) ──post──▶ POSTED
 *
 * Publicar exige: NOT_REQUIRED CON referencia de política, o APPROVED CON aprobador registrado. Un
 * NOT_REQUIRED sin referencia es una exención autodeclarada de antes de este cambio, y un APPROVED sin
 * `approved_by` una autocertificación: ninguna se trata como aprobada y ninguna se «regulariza»
 * inventando política o aprobador (se rechaza con un diagnóstico explícito).
 */
export const CLIENT_SETTABLE_APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING'] as const;

export function assertClientApprovalStatus(approvalStatus: string | undefined): void {
  if (approvalStatus === undefined) return;
  if ((CLIENT_SETTABLE_APPROVAL_STATUSES as readonly string[]).includes(approvalStatus)) return;
  throw new UnprocessableEntityException({
    code: 'ACCOUNTING_DOCUMENT_APPROVAL_NOT_CLIENT_SETTABLE',
    message:
      'El estado de aprobación lo decide el servidor: al crear sólo se admite NOT_REQUIRED o PENDING.',
    details: { approvalStatus },
  });
}

export interface ApprovalSnapshot {
  approvalStatus: string;
  approvedBy?: string | null;
  approvalPolicyRef?: string | null;
}

export function assertDocumentApprovedForPosting(document: ApprovalSnapshot): void {
  const status = document.approvalStatus;
  if (status === 'NOT_REQUIRED' && document.approvalPolicyRef) return;
  if (status === 'APPROVED' && document.approvedBy) return;
  if (status === 'NOT_REQUIRED') {
    throw new ConflictException({
      code: 'ACCOUNTING_DOCUMENT_APPROVAL_POLICY_MISSING',
      message:
        'El documento figura sin aprobación requerida pero no consta qué política lo eximió (documento anterior a la política de aprobación). Requiere regularización; no se publica.',
      details: { approvalStatus: status },
    });
  }
  throw new ConflictException({
    code: 'ACCOUNTING_DOCUMENT_APPROVAL_REQUIRED',
    message: 'El documento necesita aprobación antes de publicarse.',
    details: { approvalStatus: status },
  });
}

export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface DecisionSnapshot {
  status: string;
  approvalStatus: string;
  createdBy: string | null;
}

/** Nadie decide sobre lo que creó, y sólo se decide un borrador que espera decisión. */
export function assertCanDecide(document: DecisionSnapshot, actorId: string): void {
  if (document.createdBy && document.createdBy === actorId) {
    throw new ForbiddenException({
      code: 'ACCOUNTING_DOCUMENT_SELF_APPROVAL_FORBIDDEN',
      message: 'Quien creó el documento no puede aprobarlo ni rechazarlo.',
    });
  }
  assertPendingDraft(document);
}

export function assertPendingDraft(document: { status: string; approvalStatus: string }): void {
  if (document.status !== 'DRAFT' || document.approvalStatus !== 'PENDING') {
    throw notPendingConflict(document);
  }
}

export function notPendingConflict(document: {
  status: string;
  approvalStatus: string;
}): ConflictException {
  return new ConflictException({
    code: 'ACCOUNTING_DOCUMENT_NOT_PENDING_APPROVAL',
    message: 'Sólo se aprueba o rechaza un borrador pendiente de aprobación.',
    details: { status: document.status, approvalStatus: document.approvalStatus },
  });
}
