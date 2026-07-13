# Auditorías

## Responsabilidad

Contiene documentos de revisión técnica del módulo contable.

## Archivos

- `deployment-readiness-audit.md`: auditoría de despliegue y controles productivos.
- `use-case-compliance-audit.md`: auditoría legible de cumplimiento del catálogo completo de casos de uso.
- `use-case-compliance-audit.json`: salida estructurada de la auditoría de casos de uso generada por `scripts/audit/use-cases.ts`.

## Convenciones

- Las auditorías deben distinguir cobertura productiva real, soporte por modelo, exclusiones por integración y extensiones documentadas.
- No se debe marcar como operativo un caso que no tenga endpoint/service o job productivo asociado.
