import { ForbiddenException } from '@nestjs/common';

/**
 * Un 403 de AtlasBackend dicho con lo que hace falta para resolverlo.
 *
 * El ERP concede sus botones por rol de negocio (`ADMIN`, `OPERATIONS`…), pero AtlasBackend
 * decide por PERMISO RBAC, y los dos vocabularios no coinciden: un `SYSTEMS_ADMIN` es `ADMIN` en
 * el ERP y no tiene `partner.kyb.request`. Sin esto la pantalla enseñaba «no tiene los permisos
 * requeridos» y nadie sabía cuál. Los roles que lo llevan son los de
 * `internal-rbac.permissions.ts` de AtlasBackend; si allí cambian, aquí sólo cambia el texto.
 */
export function explainMissingAtlasPermission(error: unknown, permiso: string): unknown {
  if (!(error instanceof ForbiddenException)) return error;
  return new ForbiddenException(
    `Tu sesión de Atlas no tiene el permiso «${permiso}» (lo llevan OPERATIONS_MANAGER y SUPER_ADMIN). ` +
      `Pídelo al administrador de identidades o que lo haga alguien con ese rol. Nada se guardó.`,
  );
}
