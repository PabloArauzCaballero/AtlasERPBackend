import { SetMetadata } from '@nestjs/common';

/**
 * Marca explícita de «cualquier sesión autenticada, sin rol concreto» (TSK-ERPB-16).
 *
 * `RolesGuard` deniega por defecto: un handler sin `@Roles`, sin `@Public` y sin esta marca
 * responde 403. Así, olvidar el `@Roles` en una ruta nueva la CIERRA en vez de abrirla a cualquier
 * sesión, y quien de verdad quiere una ruta para todos lo tiene que decir aquí.
 */
export const ANY_AUTHENTICATED_KEY = 'anyAuthenticated';
export const AnyAuthenticated = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ANY_AUTHENTICATED_KEY, true);
