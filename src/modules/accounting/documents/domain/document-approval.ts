import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Aprobación del documento contable decidida por el SERVIDOR (ATL-03), versión provisional.
 *
 * Máquina de estados mientras DEC-10 (umbrales y quién aprueba) no esté decidida:
 *
 *   alta:  el cliente sólo puede pedir NOT_REQUIRED (por defecto) o PENDING.
 *   DRAFT · PENDING ──approve (actor ≠ creador)──▶ DRAFT · APPROVED ──post──▶ POSTED
 *   DRAFT · PENDING ──reject  (actor ≠ creador)──▶ DRAFT · REJECTED (terminal: no se publica)
 *
 * Publicar exige NOT_REQUIRED, o APPROVED CON aprobador registrado: un APPROVED sin `approved_by`
 * es una autocertificación de antes de este cambio y se trata como pendiente.
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
}

export function assertDocumentApprovedForPosting(document: ApprovalSnapshot): void {
  const status = document.approvalStatus;
  if (status === 'NOT_REQUIRED') return;
  if (status === 'APPROVED' && document.approvedBy) return;
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
