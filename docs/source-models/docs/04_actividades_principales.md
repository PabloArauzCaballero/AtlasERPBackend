# Diagramas de actividad — principales casos de uso

Este documento describe las actividades principales. Los diagramas formales están en `diagrams/plantuml/`.

## A. Alta comercial de comercio B2B

1. Ejecutivo registra lead.
2. Sistema valida duplicados.
3. Ejecutivo califica potencial.
4. Si califica, se crea oportunidad.
5. Si no califica, se registra motivo y se cierra.

## B. Propuesta y aprobación de pricing

1. Ejecutivo crea propuesta.
2. Sistema calcula MDR y fees sugeridos.
3. Sistema valida mínimos.
4. Si hay excepción, solicita aprobación.
5. Jefe comercial/finanzas aprueban o rechazan.
6. Se envía propuesta.

## C. Contratación y onboarding

1. Comercio acepta propuesta.
2. Legal genera contrato.
3. Se firma contrato.
4. Operaciones abre onboarding.
5. Se cargan sucursales y usuarios.
6. Se completa checklist.
7. Se activa comercio.

## D. Venta financiada y generación de MDR

1. Comercio inicia venta.
2. Core valida consumidor y línea.
3. Cliente paga 60% al comercio.
4. Se confirma compra.
5. Sistema guarda contrato vigente.
6. Sistema calcula MDR.
7. Se crea cargo comercial B2B contra comercio.

## E. Facturación B2B y cobro al comercio

1. Finanzas genera ciclo de facturación.
2. Sistema agrupa MDR/fees/suscripciones.
3. Se emite factura.
4. Se crea CxC B2B.
5. Comercio paga a ATLAS.
6. Se aplica pago y se cierra saldo.

## F. Cuota impaga, cobertura y recuperación

1. Vence cuota del consumidor.
2. Sistema verifica si el consumidor pagó al comercio.
3. Si no pagó, ATLAS programa cobertura al comercio.
4. Se crea CxP `merchant_payable`.
5. ATLAS paga al comercio.
6. Recién entonces nace recuperación contra consumidor.
7. Cobranza gestiona recuperación.

## G. Conciliación

1. Se ejecuta conciliación por periodo.
2. Se comparan compras vs MDR.
3. Se comparan facturas vs pagos.
4. Se comparan cuotas vencidas vs coberturas.
5. Se comparan coberturas vs recuperaciones.
6. Se registran diferencias.
7. Finanzas/operaciones resuelven.
