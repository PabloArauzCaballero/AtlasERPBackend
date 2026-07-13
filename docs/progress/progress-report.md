# Informe de progreso del proyecto

## 1. Resumen del ciclo de trabajo

Se ejecutó una revisión detallada del frontend acoplado al backend, se corrigieron payloads demo que no respetaban los schemas Zod reales, se mejoró la experiencia de tablas y se agregaron smoke tests backend específicos para endpoints batch/bulk.

## 2. Avance realizado

- Se ajustaron vistas del Portal comercio para BNPL, sucursales y usuarios merchant.
- Se ajustaron vistas CRM B2B para oportunidades, aprobaciones, contratos, onboarding, activación, cobertura y facturación.
- Se ajustaron vistas contables para estructura financiera, periodos, ledgers, COA, impuestos, business partners, contratos, documentos, bulk de documentos, AR invoices y recibos.
- Se corrigieron whitelists de filtros en `adsService.ts` según schemas reales del backend.
- Se mejoró `ResourceList` con debounce, selector de página, controles anterior/siguiente y resumen de registros.
- Se agregó `hooks/useDebouncedValue.ts` para evitar llamadas repetidas al backend por cada tecla.
- Se agregó `scripts/smoke/batch-endpoints.smoke.ts`.
- Se agregó script `npm run smoke:batch` y se incorporó a `smoke:all`.
- Se documentó la revisión en `docs/audit/frontend-detailed-review.md`.
- Se documentó el smoke batch en `docs/smoke/batch-endpoints-smoke.md`.

## 3. Riesgos detectados

| Riesgo | Impacto | Mitigación recomendada |
|---|---|---|
| Algunas vistas siguen siendo solo acción porque el backend no expone listados. | UX menos completa y más dependiente de UUID manual. | Crear endpoints `GET` solo cuando exista contrato de permisos y filtros. |
| Los payloads demo usan UUIDs placeholder. | Si se ejecutan sin datos seed reales, el backend puede responder 404/409/400 de negocio. | Reemplazar placeholders por IDs reales desde listados o selects cuando existan endpoints de catálogo. |
| No hay dependencias instaladas del frontend en el ZIP. | No se puede ejecutar `next build` dentro del entorno actual. | Ejecutar `npm install && npm run check` en `frontend/atlas-erp-web`. |
| Smoke batch requiere API corriendo. | No se puede validar HTTP real sin backend levantado y DB disponible. | Ejecutar después de `npm run start:dev` o en entorno QA. |

## 4. Decisiones clave tomadas

| Decisión | Justificación | Impacto |
|---|---|---|
| Usar smoke batch de validación-only. | Verifica ruta, guard y Zod sin crear datos accidentales. | Menor riesgo operativo y más seguro para QA. |
| No crear endpoints backend nuevos para brechas UI. | No hay reglas de negocio ni permisos definidos. | Evita contratos falsos o inseguros. |
| Mantener `fetch` solo en `apiClient.ts`. | Cumple la arquitectura frontend solicitada. | Services siguen siendo la única capa de API. |
| Corregir payloads demo contra schemas reales. | Reducir 400 falsos por frontend mal alineado. | Las vistas quedan más útiles para pruebas manuales. |

## 5. Desviaciones de lo esperado

| Desviación | Motivo | Acción recomendada |
|---|---|---|
| No se ejecutó build real de Next.js. | El ZIP no contiene `node_modules` frontend y el entorno no instala dependencias externas. | Ejecutar `npm install && npm run check` localmente en `frontend/atlas-erp-web`. |
| No se ejecutó smoke HTTP batch. | Requiere API y PostgreSQL corriendo. | Ejecutar `npm run smoke:batch` en local/QA con backend levantado. |

## 6. Fase actual del proyecto

Fase de hardening de acople frontend-backend y smoke testing batch.

## 7. Próxima fase recomendada

Agregar selects alimentados por endpoints reales para reemplazar UUIDs manuales donde el backend exponga listados seguros.

## 8. Estado general del entregable

Parcial validado: backend compila, lint y pruebas pasan; frontend fue auditado estáticamente y mejorado, pendiente de build local con dependencias instaladas.
