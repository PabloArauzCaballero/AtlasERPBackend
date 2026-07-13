# Flujos principales

## Alta comercial

1. Ejecutivo crea cuenta B2B.
2. Sistema valida duplicados por NIT o nombre comercial.
3. Crea `b2b_account` en `LEAD`.
4. Crea contacto principal.
5. Registra auditoría.

## Calificación

1. Ejecutivo califica la cuenta.
2. Si tiene fit, pasa a `QUALIFIED`.
3. Opcionalmente crea oportunidad en `DISCOVERY`.
4. Si no tiene fit, pasa a `DISQUALIFIED` y conserva motivo.

## Propuesta y pricing

1. Ejecutivo crea propuesta con líneas.
2. Si MDR está debajo del mínimo configurado, se crea `approval_request`.
3. La propuesta no puede enviarse mientras haya aprobación pendiente.
4. Si se aprueba, vuelve a `DRAFT` y puede enviarse.
5. Si el comercio acepta, la propuesta pasa a `ACCEPTED` y la oportunidad a `CONTRACTING`.

## Contratación

1. Legal crea contrato desde propuesta aceptada.
2. Se crea `b2b_contract` y `contract_version` inicial.
3. Las líneas de propuesta se congelan como `commercial_terms`.
4. Al firmar, contrato y versión pasan a activos.
5. La oportunidad se cierra como `CLOSED_WON`.

## Onboarding

1. Operaciones crea caso con checklist.
2. Registra sucursales y usuarios corporativos.
3. Completa checklist.
4. Para activar, el sistema exige contrato activo y checklist completo.
5. Cuenta pasa a `CUSTOMER`; sucursales pendientes pasan a `ACTIVE` y `can_originate_bnpl=true`.

## Venta BNPL y MDR

1. Comercio inicia compra BNPL.
2. Sistema valida cuenta `CUSTOMER`, sucursal activa y contrato vigente.
3. Valida pago inicial 60% y financiamiento 40%.
4. Crea compra y cuotas.
5. Guarda `contract_version_id` vigente.
6. Calcula MDR desde `mdr_rules` o `commercial_terms`.
7. Crea `merchant_receivable` MDR contra comercio.

## Facturación y cobro B2B

1. Finanzas selecciona receivables abiertos.
2. Se crea invoice y líneas.
3. Cargos quedan asociados a la factura.
4. Comercio paga.
5. Pago se aplica por allocations explícitas.
6. Sistema actualiza saldos y estados.

## Cobertura y recuperación

1. Una cuota queda impaga.
2. Se crea CxP `merchant_payable` por esa cuota específica.
3. ATLAS paga al comercio.
4. Recién al marcar CxP como `PAID` nace `consumer_recovery_receivable`.
5. Recuperaciones parciales actualizan saldo y estado.

## Conciliación

1. Finanzas/Operaciones ejecuta `reconciliation_run`.
2. Sistema detecta compras sin MDR, CxC vencidas, cuotas sin CxP y CxP pagadas sin recuperación.
3. Se crean `reconciliation_items`.
4. El run queda `COMPLETED` u `OPEN_ITEMS`.

## Flujo de pago inicial consumidor → comercio

Al registrar una compra BNPL, el sistema valida que el pago inicial sea 60% del valor de compra y registra ese pago en `consumer_payments_to_merchant`. Este registro no reemplaza la CxC B2B por MDR ni la CxP ATLAS→comercio por cobertura; solo preserva trazabilidad operativa del dinero que el consumidor pagó directamente al comercio.
