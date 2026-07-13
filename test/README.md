# Pruebas

Incluye pruebas unitarias de schemas y configuración e2e base. Para e2e completo se requiere PostgreSQL con migraciones aplicadas y JWT válido.

Casos recomendados adicionales:

- Crear cuenta duplicada por NIT.
- Bloquear propuesta MDR menor al mínimo sin justificación.
- Rechazar envío de propuesta con aprobación pendiente.
- Bloquear compra BNPL sin contrato activo.
- Verificar creación de `merchant_receivable` MDR.
- Aplicar pago parcial y total de comercio.
- Crear recuperación solo después de `merchant_payable.PAID`.
- Conciliación con diferencias esperadas.
