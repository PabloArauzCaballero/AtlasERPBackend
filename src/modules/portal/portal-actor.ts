import type { AuthUser } from '../../common/types/auth-context.types';
import type { PortalScope } from './portal.scope.service';

/** Contexto del llamador ya resuelto: identidad + correlador + alcance por tenant. */
export interface PortalActor {
  user: AuthUser;
  requestId: string;
  scope: PortalScope;
}

/** Arma el `PortalActor` de una petición: el alcance lo resuelve el servidor, nunca el cliente. */
export async function buildPortalActor(
  scopeService: { resolveScope(user: AuthUser): Promise<PortalScope> },
  user: AuthUser,
  requestId: string,
): Promise<PortalActor> {
  return { user, requestId, scope: await scopeService.resolveScope(user) };
}
