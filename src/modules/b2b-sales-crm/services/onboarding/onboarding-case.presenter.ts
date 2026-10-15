import { ChecklistStatus } from '../../b2b-sales-crm.enums';
import type { MerchantOnboardingCaseModel } from '../../models/b2b-sales-crm.models';

/**
 * «Pendiente» con la regla de la activación: todo lo que no esté completado ni eximido. Antes la
 * lista contaba sólo `PENDING` y la activación también rechazaba `BLOCKED`, así que un caso podía
 * enseñar «0 pendientes» y aun así no activarse.
 */
export function countPendingItems(items: readonly { status: string }[]): number {
  return items.filter(
    (item) => item.status !== ChecklistStatus.COMPLETED && item.status !== ChecklistStatus.WAIVED,
  ).length;
}

/**
 * La posición del caso en la cadena, tal como la lee la fila: el contrato pactado y lo que dijo
 * el Motor. Se publica igual en la lista y en el detalle para que la pantalla no tenga dos formas.
 */
export function describeCaseChain(row: MerchantOnboardingCaseModel): Record<string, unknown> {
  return {
    contractVersionId: row.contractVersionId,
    contractNumber: row.contractVersion?.contract?.contractNumber ?? null,
    contractVersionNumber: row.contractVersion?.versionNumber ?? null,
    contractVersionStatus: row.contractVersion?.status ?? null,
    decisionOutcome: row.decisionOutcome,
    decisionReason: row.decisionReason,
    decisionExecutionId: row.decisionExecutionId,
    manualReviewCaseCode: row.manualReviewCaseCode,
    decidedAt: row.decidedAt,
    identityAcknowledgedAt: row.identityAcknowledgedAt,
    partnerProfileId: row.account?.partnerProfileId ?? null,
  };
}
