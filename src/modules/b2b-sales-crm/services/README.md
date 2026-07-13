# Services del módulo B2B CRM/Ventas

Contiene la lógica de negocio del módulo dividida por subdominio para evitar una clase monolítica difícil de mantener.

## Archivos

- `b2b-sales-crm.service.ts`: fachada estable consumida por controllers. No contiene reglas complejas; delega al servicio especializado correspondiente.
- `b2b-accounts.service.ts`: cuentas B2B, contactos, calificación comercial y apertura de oportunidad desde lead.
- `b2b-pipeline.service.ts`: oportunidades, propuestas comerciales, aprobaciones y aceptación/rechazo de propuestas.
- `b2b-contracts.service.ts`: creación de contratos desde propuesta y activación contractual.
- `b2b-onboarding.service.ts`: onboarding comercial, checklist, sucursales y usuarios merchant.
- `b2b-bnpl-billing.service.ts`: compra BNPL, pago inicial consumidor→comercio, MDR, facturación y pagos del comercio.
- `b2b-coverage.service.ts`: CxP ATLAS→comercio y recuperación contra consumidor.
- `b2b-reconciliation.service.ts`: conciliación operativa del módulo.
- `b2b-sales-crm-use-case.base.ts`: reglas de cálculo compartidas y utilidades de dominio reutilizadas por varios servicios.

## Convenciones

- Cada caso de uso inicia con log Pino estructurado.
- Las operaciones que modifican varias tablas se ejecutan dentro de transacciones controladas por service.
- No se registran tokens, cuerpos completos ni datos sensibles en logs.
- La fachada conserva el contrato para controllers y evita acoplar HTTP con detalles de subdominio.

## Qué no debe ir aquí

- Queries sueltas sin pasar por repository.
- Configuración global.
- Validaciones HTTP que pertenezcan a schemas Zod.
- Integraciones externas improvisadas.
