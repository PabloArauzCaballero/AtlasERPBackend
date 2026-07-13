# Guards comunes

- `JwtAuthGuard`: valida JWT Bearer y adjunta el usuario autenticado al request.
- `RolesGuard`: valida autorización por rol.

No contienen reglas de negocio del módulo; solo controlan acceso.
