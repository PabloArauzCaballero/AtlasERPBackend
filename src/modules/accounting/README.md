# Módulo Accounting

## Responsabilidad

Implementa el núcleo contable de ATLAS:

- Estructura financiera.
- Business Partners.
- Contratos.
- Documentos contables.
- Journal universal.
- Billing y AR.
- Recibos y tesorería de entrada.
- Cierre de períodos.

## Estructura de carpetas

El módulo se organiza por **dominio de negocio**, y dentro de cada dominio por **capa técnica**
(`controllers/`, `services/`, `validators/`). Esto separa responsabilidades y permite escalar
cada área de forma independiente.

```
accounting/
├── accounting.module.ts          # Wiring del módulo NestJS
├── shared/
│   └── schemas/                   # Esquemas Zod compartidos (accounting.schemas.ts)
├── account-groups/               # Grupos de cuentas
│   ├── controllers/
│   └── services/
├── billing/                      # Billing event + factura AR con asiento automático
│   ├── controllers/
│   └── services/
├── business-partners/            # Business Partners y validación de roles BP
│   ├── controllers/
│   └── services/                 # incluye business-partner-role-validation.service
├── closing/                      # Cierre de períodos y controles de cierre
│   ├── controllers/
│   └── services/                 # closing.service + closing-control.service
├── contracts/                    # Contratos y términos
│   ├── controllers/
│   └── services/
├── documents/                    # Documentos contables (journal universal)
│   ├── controllers/
│   └── services/                 # accounting-documents.service
├── financial-structure/          # Estructura financiera
│   ├── controllers/
│   └── services/
├── posting/                      # Motor de contabilización (transversal)
│   ├── services/                 # period-guard, sap-posting-validation, posting-rule-snapshot
│   └── validators/               # double-entry.validator
└── receipts/                     # Cobros, asignaciones AR y asiento automático
    ├── controllers/
    └── services/
```

### Servicios clave

- `documents/services/accounting-documents.service.ts`: creación, publicación y reverso de documentos contables.
- `posting/services/sap-posting-validation.service.ts`: validación SAP-like de período, ledger, cuentas y dimensiones.
- `posting/validators/double-entry.validator.ts`: validación de doble partida en aplicación.
- `business-partners/services/business-partner-role-validation.service.ts`: control de roles BP por proceso.
- `closing/services/closing-control.service.ts`: controles mínimos de cierre.
- `billing/services/billing.service.ts`: billing event y factura AR con asiento automático.
- `receipts/services/receipts.service.ts`: cobros, asignaciones AR y asiento automático.

> **Convención**: un dominio nuevo se crea como carpeta hermana con sus subcarpetas
> `controllers/` y `services/`. Lo verdaderamente transversal (motor de posting, esquemas)
> vive en `posting/` y `shared/`.

## Flujo general

1. La request entra por un controller.
2. Zod valida body, params o query.
3. Guards globales validan JWT y roles.
4. El service ejecuta reglas de negocio.
5. Sequelize persiste cambios dentro de transacciones.
6. Se genera outbox para integración posterior.
7. La respuesta se normaliza con `ResponseInterceptor`.

## Reglas críticas

- Ningún asiento publicado se edita.
- Los reversos crean un nuevo documento contable.
- Todo asiento debe cuadrar: débito = crédito.
- No se contabiliza en períodos cerrados.
- La fecha de posting debe caer dentro del período contable.
- Ledger y período deben pertenecer a la entidad legal del documento.
- Las cuentas de control requieren referencia de submayor.
- Las dimensiones obligatorias de cada cuenta se validan antes del asiento.
- Factura comercial, documento fiscal electrónico y asiento contable son objetos separados.
- El cierre no procede con documentos DRAFT, conciliaciones abiertas o banco sin matching aprobado.
- El outbox guarda eventos idempotentes para integración posterior.

## Qué no debe ir aquí

- Autenticación central de usuarios.
- Integración real SIAT.
- Workers de colas no definidos.
- Reglas fiscales no aprobadas por contabilidad/legal.
