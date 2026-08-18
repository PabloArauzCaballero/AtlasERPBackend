import { ConflictException } from '@nestjs/common';

/**
 * Invariantes de transición de estado de una campaña.
 *
 * Vive fuera de los servicios porque hay dos entradas al mismo agregado: la consola administrativa
 * (`/admin/ads/campaigns/:id/status`) y el portal del comercio (`/portal/campaigns/:id/status`).
 * Si cada una reimplementa las reglas, la ruta menos vigilada termina permitiendo lo que la otra
 * prohíbe — en particular activar una campaña sin aprobación de moderación, que se entrega y se
 * factura igual.
 */

/** Estados desde los que una campaña ya no puede volver a entregarse. */
export const TERMINAL_CAMPAIGN_STATUSES = ['ENDED', 'ARCHIVED'] as const;

export function assertCampaignTransition(
  currentStatus: string,
  approvalStatus: string,
  nextStatus: string,
): void {
  if (
    (TERMINAL_CAMPAIGN_STATUSES as readonly string[]).includes(currentStatus) &&
    nextStatus === 'ACTIVE'
  ) {
    throw new ConflictException({
      code: 'INVALID_CAMPAIGN_TRANSITION',
      message: 'No se puede reactivar una campaña finalizada o archivada.',
    });
  }

  if (nextStatus === 'ACTIVE' && approvalStatus !== 'APPROVED') {
    throw new ConflictException({
      code: 'CAMPAIGN_NOT_APPROVED',
      message: 'No se puede activar una campaña sin aprobación de moderación.',
    });
  }
}
