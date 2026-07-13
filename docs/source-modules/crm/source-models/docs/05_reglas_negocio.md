# Reglas de negocio e integridad — ATLAS CRM/Ventas B2B

## Reglas comerciales

1. El cliente del módulo CRM/Ventas B2B es el comercio/corporativo, no el consumidor final.
2. Un comercio puede estar en estados: `LEAD`, `QUALIFIED`, `CUSTOMER`, `SUSPENDED`, `TERMINATED`.
3. Una oportunidad no puede pasar a `CONTRACTING` sin propuesta aceptada.
4. Una propuesta con MDR menor al mínimo configurado requiere aprobación.
5. Las condiciones comerciales deben versionarse; no se sobrescriben condiciones antiguas.
6. El MDR se calcula usando la versión contractual vigente al momento de la compra.
7. Una sucursal no puede originar BNPL si está inactiva o sin onboarding completo.
8. Un comercio no puede operar sin contrato activo.

## Reglas financieras

1. `merchant_receivables` representa CxC comercial B2B contra comercios.
2. `merchant_receivables` no representa cuotas normales del consumidor.
3. Las cuotas normales son pagadas por el consumidor directamente al comercio.
4. Si el consumidor no paga, ATLAS crea una CxP hacia el comercio por la cuota específica.
5. ATLAS no acelera toda la deuda: cubre cuota por cuota según calendario.
6. La CxC contra consumidor nace solo después de que ATLAS cubre la cuota al comercio.
7. Un pago parcial del comercio debe aplicarse por asignación explícita a facturas/cargos.
8. Toda nota de crédito debe tener motivo y usuario aprobador.

## Reglas de auditoría

1. Cambios en MDR, contratos, estados de comercio, facturas, notas y pagos deben auditarse.
2. Ninguna excepción de pricing debe quedar sin `approval_request`.
3. Toda conciliación debe guardar diferencias y resolución.
4. El sistema debe conservar histórico de quién aprobó, cuándo y por qué.

## Reglas de datos

1. Montos monetarios usan `numeric(18,2)` o mayor precisión para tasas.
2. Tasas MDR usan `numeric(9,6)` para evitar pérdida de precisión.
3. Fechas relevantes deben guardarse con zona horaria cuando representen eventos.
4. Estados deben implementarse con catálogos/enums controlados.
5. Se recomienda `uuid` como PK para evitar colisiones y facilitar integración.
