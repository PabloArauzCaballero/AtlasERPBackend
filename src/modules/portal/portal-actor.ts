import type { AuthUser } from '../../common/types/auth-context.types';
import type { PortalScope } from './portal.scope.service';

/** Contexto del llamador ya resuelto: identidad + correlador + alcance por tenant. */
export interface PortalActor {
  user: AuthUser;
  requestId: string;
  scope: PortalScope;
}
