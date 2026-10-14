import type { AtlasMerchantProvisioningRequest } from '../../../auth-gateway/auth-gateway.types';

/**
 * Aplica lo que dijo Atlas sobre una petición. Devuelve si la fila cambió.
 *
 * El rechazo NO borra la fila: trae motivo y el ejecutivo tiene que poder leerlo, corregir y
 * volver a pedirlo. Borrarla dejaría el rechazo sin dónde consultarse.
 */
export async function applyProvisioningResult(
  user: {
    status: string;
    userId: string | null;
    update: (values: Record<string, unknown>) => Promise<unknown>;
  },
  request: AtlasMerchantProvisioningRequest,
): Promise<boolean> {
  if (request.status === 'provisioned' && request.merchantUserId && !user.userId) {
    await user.update({ userId: request.merchantUserId, status: 'ACTIVE' });
    return true;
  }
  if (request.status === 'rejected' && user.status !== 'DISABLED') {
    await user.update({
      status: 'DISABLED',
      identityRejectionReason: request.rejectionReason ?? null,
    });
    return true;
  }
  return false;
}
