# Progreso

Contiene informes de progreso y auditoría técnica del proyecto.

## Archivo principal

- `progress-report.md`: registra avances, riesgos, decisiones, desviaciones y estado del entregable.

## Los registros de ejecución (`checks/*.log`)

Los informes de esta carpeta y de `docs/source-modules/*/progress/` citan registros de compilación,
lint y pruebas de julio de 2026 en `checks/`. Esos `.log` salieron del árbol el 2026-09-13: eran la
salida de corridas de la entrega inicial, no evidencia del estado actual, y los gates vigentes se
leen en la CI (`.github/workflows/ci.yml`). Siguen en el historial; para consultarlos:

```bash
git show c62c5ce:docs/progress/checks/additional-review/build-final.log
git ls-tree -r --name-only c62c5ce -- docs/progress/checks docs/source-modules/crm/progress/checks
```

Los informes que los citan se conservan como documentos históricos: describen aquella entrega,
no el ERP de hoy.
