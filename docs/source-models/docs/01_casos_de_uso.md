# Casos de uso — CRM/Ventas B2B ATLAS

## Actores

| Actor                          | Descripción                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Ejecutivo comercial            | Captura leads, gestiona cuentas, oportunidades y propuestas.                    |
| Jefe comercial                 | Aprueba descuentos, MDR especiales, forecast y cierre comercial.                |
| Legal/Compliance               | Revisa documentación legal, contrato y habilitación comercial.                  |
| Operaciones ATLAS              | Valida onboarding, sucursales, usuarios del comercio y configuración operativa. |
| Finanzas/Contabilidad          | Emite facturas B2B, registra pagos, notas de crédito, conciliaciones y CxP/CxC. |
| Administrador de comercio      | Usuario corporativo del comercio aliado.                                        |
| Sistema BNPL/Core Crédito      | Origina compras financiadas, cuotas, mora, cobertura y recuperación.            |
| Sistema de facturación SIN/ERP | Emisión fiscal, CUF/CUFD, asientos y conciliación contable.                     |

---

## UC-01 Prospectar comercio corporativo

**Objetivo:** registrar un comercio/negocio potencial para venderle la solución BNPL de ATLAS.

**Disparador:** ejecutivo identifica retailer, concesionaria, tienda, distribuidor o partner potencial.

**Precondiciones:** el comercio no existe como cuenta activa duplicada.

**Flujo principal:**

1. Ejecutivo registra datos mínimos: razón social, nombre comercial, rubro, NIT si existe, ciudad, fuente del lead.
2. Sistema crea `b2b_account` en estado `LEAD`.
3. Sistema crea contacto principal en `b2b_contact`.
4. Ejecutivo agenda primera actividad comercial.
5. Sistema asigna dueño comercial y territorio.

**Resultado:** lead B2B creado y trazable.

**Datos críticos:** rubro, ciudad, origen, potencial de ventas, ejecutivo responsable.

---

## UC-02 Calificar cuenta B2B

**Objetivo:** decidir si el comercio merece avance comercial.

**Flujo principal:**

1. Ejecutivo completa perfil: tamaño, sucursales, ticket promedio, volumen mensual, categoría de productos.
2. Sistema calcula fit comercial preliminar.
3. Ejecutivo marca score de oportunidad: bajo, medio, alto.
4. Jefe comercial puede validar la prioridad.
5. Sistema cambia estado a `QUALIFIED` o `DISQUALIFIED`.

**Regla:** una cuenta descalificada no puede tener propuesta activa salvo reapertura aprobada.

---

## UC-03 Crear oportunidad comercial

**Objetivo:** gestionar una negociación específica con una cuenta B2B.

**Flujo principal:**

1. Ejecutivo crea `sales_opportunity` asociada a cuenta.
2. Define producto comercial: MDR BNPL, suscripción, API, licenciamiento, campaña, paquete mixto.
3. Estima volumen mensual financiado, ticket promedio y fecha probable de cierre.
4. Sistema calcula ingreso esperado por MDR.
5. Oportunidad entra en etapa `DISCOVERY`.

**Resultado:** pipeline comercial medible.

---

## UC-04 Generar propuesta/cotización B2B

**Objetivo:** presentar condiciones comerciales al comercio.

**Flujo principal:**

1. Ejecutivo selecciona oportunidad.
2. Sistema propone plan base según rubro, volumen y riesgo operativo.
3. Ejecutivo agrega MDR, fee fijo, suscripción, setup fee y condiciones especiales.
4. Si hay descuento o MDR bajo mínimo, se solicita aprobación.
5. Sistema genera `commercial_proposal` y líneas de precio.
6. Propuesta queda `SENT`.

**Regla:** no se puede enviar propuesta con MDR menor al mínimo sin aprobación de jefe comercial/finanzas.

---

## UC-05 Aprobar condiciones comerciales especiales

**Objetivo:** controlar excepciones de pricing.

**Flujo principal:**

1. Sistema detecta excepción: MDR bajo mínimo, plazo especial, fee condonado o volumen comprometido agresivo.
2. Crea solicitud de aprobación.
3. Jefe comercial revisa margen esperado y justificación.
4. Finanzas valida impacto económico.
5. Sistema registra aprobación/rechazo con auditoría.

**Resultado:** pricing controlado y auditable.

---

## UC-06 Firmar contrato B2B

**Objetivo:** convertir una oportunidad ganada en relación contractual vigente.

**Flujo principal:**

1. Oportunidad pasa a `NEGOTIATION`.
2. Legal adjunta contrato o plantilla.
3. Se registran vigencia, MDR, condiciones de liquidación, facturación, responsabilidad por fraude, SLA y causal de terminación.
4. Comercio acepta/firma.
5. Sistema crea `b2b_contract` y `contract_version` activa.
6. Oportunidad pasa a `CLOSED_WON`.

**Regla:** ningún comercio puede operar ventas BNPL sin contrato activo.

---

## UC-07 Onboarding de comercio y sucursales

**Objetivo:** dejar listo al comercio para operar.

**Flujo principal:**

1. Operaciones crea plan de onboarding.
2. Se registran sucursales, usuarios corporativos, cuentas bancarias de referencia, horarios y contactos operativos.
3. Se completan checklist: documentación legal, capacitación, pruebas de venta, QR/bancos si aplica, acceso al portal.
4. Sistema valida condiciones mínimas.
5. Comercio queda `ONBOARDED`.

**Regla:** sucursal no puede originar compras si no está activa.

---

## UC-08 Activar comercio para operar BNPL

**Objetivo:** habilitar formalmente al comercio en el core BNPL.

**Flujo principal:**

1. Sistema verifica contrato activo, onboarding completo y condiciones comerciales vigentes.
2. Operaciones activa cuenta y sucursales.
3. Sistema publica configuración al portal del comercio.
4. Comercio puede generar compras financiadas.

---

## UC-09 Registrar venta financiada desde comercio

**Objetivo:** registrar una compra BNPL originada por comercio activo.

**Flujo resumido:**

1. Comercio inicia venta financiada.
2. Core Crédito valida consumidor, línea disponible, producto y reglas de riesgo.
3. Consumidor paga 60% directo al comercio.
4. Sistema crea compra, plan de cuotas y etiqueta cohorte/riesgo.
5. Se calcula MDR devengado por venta.

**Nota:** el pago del consumidor al comercio no es cobro de ATLAS.

---

## UC-10 Liquidar MDR por venta financiada

**Objetivo:** reconocer ingreso comercial de ATLAS contra el comercio.

**Flujo principal:**

1. Compra financiada queda confirmada.
2. Sistema calcula MDR según contrato vigente al momento de la venta.
3. Crea `merchant_receivable` por MDR o acumula en corte periódico.
4. Finanzas emite factura B2B o nota de débito según política.

**Resultado:** CxC B2B contra comercio, no contra consumidor.

---

## UC-11 Facturar cargos B2B al comercio

**Objetivo:** facturar MDR, suscripciones, setup fee, servicios o penalidades.

**Flujo principal:**

1. Finanzas genera periodo de facturación.
2. Sistema agrupa cargos por comercio, contrato, moneda e impuesto.
3. Se emite `merchant_invoice`.
4. Si hay integración fiscal, se envía al sistema SIN/ERP.
5. Se crean/actualizan `merchant_receivable`.

---

## UC-12 Registrar pago de comercio a ATLAS

**Objetivo:** cerrar CxC comercial B2B.

**Flujo principal:**

1. Finanzas registra pago recibido del comercio.
2. Sistema aplica pago contra facturas/cargos abiertos.
3. Si pago es parcial, saldo queda pendiente.
4. Si hay diferencia, queda en conciliación.
5. CxC pasa a `PAID` cuando saldo es cero.

---

## UC-13 Gestionar cuota impaga y cobertura ATLAS → comercio

**Objetivo:** modelar correctamente la promesa de ATLAS al comercio.

**Flujo principal:**

1. Core detecta cuota vencida no pagada al comercio.
2. Sistema programa obligación de ATLAS con el comercio por esa cuota específica.
3. Se crea `merchant_payable`.
4. Finanzas/Operaciones ejecuta pago al comercio en fecha acordada.
5. Al pagar, sistema crea `consumer_recovery_receivable` contra consumidor.

**Regla crítica:** no se acelera toda la deuda; se cubre cuota por cuota.

---

## UC-14 Recuperar monto cubierto al consumidor

**Objetivo:** recuperar de consumidor lo que ATLAS pagó al comercio.

**Flujo principal:**

1. Nace la CxC de recuperación contra consumidor luego de cobertura.
2. Cobranza gestiona recordatorios, promesas de pago y recuperación.
3. Pagos recuperados reducen saldo.
4. Se cierra cuando se recupera o se castiga.

**Nota:** este flujo pertenece a cobranza/riesgo, no al CRM B2B.

---

## UC-15 Conciliar operaciones B2B y BNPL

**Objetivo:** validar coherencia entre compras, MDR, facturas, pagos, cuotas cubiertas y recuperaciones.

**Flujo principal:**

1. Sistema ejecuta conciliación por periodo.
2. Compara compras confirmadas vs MDR generado.
3. Compara facturas B2B vs pagos del comercio.
4. Compara cuotas impagas vs CxP ATLAS → comercio.
5. Compara coberturas pagadas vs CxC de recuperación al consumidor.
6. Diferencias quedan como `reconciliation_item`.

---

## UC-16 Renovar o renegociar contrato B2B

**Objetivo:** controlar cambios de MDR, servicios o condiciones comerciales.

**Flujo principal:**

1. Sistema alerta contratos próximos a vencer.
2. Ejecutivo abre oportunidad de renovación.
3. Se negocian nuevas condiciones.
4. Legal/Finanzas aprueban.
5. Se crea nueva versión contractual.
6. Las nuevas ventas usan la versión vigente desde su fecha de inicio.

**Regla:** nunca se sobrescribe el MDR histórico aplicado a compras pasadas.
