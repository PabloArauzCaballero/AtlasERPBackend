import { ConflictException } from '@nestjs/common';
import { TERMINAL_CAMPAIGN_STATUSES, assertCampaignTransition } from './ads.campaign-transitions';

/** Extrae el código de error del cuerpo estructurado que exponen las excepciones del módulo. */
function codeOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return ((error as ConflictException).getResponse() as { code: string }).code;
  }

  throw new Error('Se esperaba una ConflictException y la transición fue aceptada.');
}

describe('assertCampaignTransition', () => {
  it('no deja activar una campaña sin aprobación de moderación', () => {
    // Es la invariante que protege el gasto: una campaña rechazada que se activa se entrega y se
    // factura igual, tanto desde la consola administrativa como desde el portal del comercio.
    for (const approvalStatus of ['PENDING', 'REJECTED', 'IN_REVIEW']) {
      expect(codeOf(() => assertCampaignTransition('PAUSED', approvalStatus, 'ACTIVE'))).toBe(
        'CAMPAIGN_NOT_APPROVED',
      );
    }
  });

  it('no deja reactivar una campaña en estado terminal, aunque esté aprobada', () => {
    for (const currentStatus of TERMINAL_CAMPAIGN_STATUSES) {
      expect(codeOf(() => assertCampaignTransition(currentStatus, 'APPROVED', 'ACTIVE'))).toBe(
        'INVALID_CAMPAIGN_TRANSITION',
      );
    }
  });

  it('acepta activar una campaña aprobada que todavía no es terminal', () => {
    expect(() => assertCampaignTransition('PAUSED', 'APPROVED', 'ACTIVE')).not.toThrow();
    expect(() => assertCampaignTransition('DRAFT', 'APPROVED', 'ACTIVE')).not.toThrow();
    expect(() => assertCampaignTransition('SCHEDULED', 'APPROVED', 'ACTIVE')).not.toThrow();
  });

  it('permite siempre detener la entrega: pausar no depende de la aprobación', () => {
    expect(() => assertCampaignTransition('ACTIVE', 'REJECTED', 'PAUSED')).not.toThrow();
    expect(() => assertCampaignTransition('ACTIVE', 'APPROVED', 'PAUSED')).not.toThrow();
    expect(() => assertCampaignTransition('ACTIVE', 'APPROVED', 'ENDED')).not.toThrow();
    // Archivar algo ya terminal es idempotente desde el punto de vista de la entrega.
    expect(() => assertCampaignTransition('ENDED', 'APPROVED', 'ARCHIVED')).not.toThrow();
  });
});
