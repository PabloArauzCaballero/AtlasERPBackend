# ATLAS_ACCOUNTING_IMPLEMENTATION_SKILL

## Objetivo

Implementar el módulo contable general de ATLAS usando un diseño SAP-like liviano, modular y auditable.

## Reglas bloqueantes

1. TEMP = 0.
2. Si falta información contractual, fiscal o contable, pedirla antes de inventar.
3. Nunca generar datos estáticos en lógica de negocio. Usar catálogos, seeds versionados o configuración.
4. Nunca editar un asiento publicado; usar reverso.
5. Nunca mezclar documento fiscal, factura comercial y asiento contable como si fueran lo mismo.
6. Nunca crear clases Dios. Separar aplicación, dominio, infraestructura y presentación.
7. Todo evento externo debe ser idempotente.
8. Todo cierre debe congelar snapshots.
9. Toda regla contable debe estar versionada.
10. Todo proceso sensible debe tener auditoría y segregación de funciones.

## Orden recomendado de implementación

### Fase 1: Núcleo contable

- legal entities
- fiscal years
- accounting periods
- ledgers
- chart of accounts
- gl accounts
- accounting documents
- journal entries
- journal entry lines
- posting rules
- audit log

### Fase 2: Terceros y contratos

- business partner
- roles
- bancos de terceros
- contratos
- términos versionados

### Fase 3: AR/AP y facturación

- billing events
- billing rules
- AR invoices
- AP invoices
- tax codes
- electronic tax document

### Fase 4: Tesorería y conciliación

- bank accounts
- bank statements
- receipts
- payment orders
- reconciliation runs

### Fase 5: Deuda, activos y provisiones

- loan contracts
- loan schedules
- loan accruals
- fixed assets
- depreciation runs
- provision cases

### Fase 6: Cierre y reporting

- close runs
- statement snapshots
- tax forms
- management reports

## Estándares de código

- Domain services pequeños.
- Use cases por acción de negocio.
- DTOs separados de entidades.
- Repositories por agregado.
- Transacciones explícitas en servicios de aplicación.
- Validaciones de dominio antes de persistir.
- Tests de partida doble, periodo cerrado, idempotencia, reverso y conciliación.

## Smoke tests mínimos

1. Crear entidad legal, ledger, periodo y plan de cuentas.
2. Crear business partner comercio.
3. Crear contrato MDR.
4. Crear billing event.
5. Emitir factura.
6. Generar asiento balanceado.
7. Publicar asiento.
8. Registrar cobro.
9. Conciliar banco contra AR.
10. Cerrar periodo.
11. Intentar postear en periodo cerrado y verificar bloqueo.
12. Revertir asiento con documento de reverso.
