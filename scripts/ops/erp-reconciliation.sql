-- Consultas de conciliación del ensayo de restore (P-17). Una fila «clave|valor» por control;
-- la base ORIGEN y la RESTAURADA deben dar exactamente las mismas filas. `md5:` resume el
-- contenido completo de cada tabla (orden estable por el texto de la fila).
-- Se ejecuta como UNA sola sentencia (psql -c muestra sólo el último resultado).
SELECT k || '|' || v FROM (
  SELECT 'filas:atlas_sales.b2b_accounts' AS k, count(*)::text AS v FROM atlas_sales.b2b_accounts
  UNION ALL SELECT 'md5:atlas_sales.b2b_accounts', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.b2b_accounts x
  UNION ALL SELECT 'filas:atlas_sales.b2b_contracts' AS k, count(*)::text AS v FROM atlas_sales.b2b_contracts
  UNION ALL SELECT 'md5:atlas_sales.b2b_contracts', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.b2b_contracts x
  UNION ALL SELECT 'filas:atlas_sales.contract_versions' AS k, count(*)::text AS v FROM atlas_sales.contract_versions
  UNION ALL SELECT 'md5:atlas_sales.contract_versions', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.contract_versions x
  UNION ALL SELECT 'filas:atlas_sales.consumers_ref' AS k, count(*)::text AS v FROM atlas_sales.consumers_ref
  UNION ALL SELECT 'md5:atlas_sales.consumers_ref', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.consumers_ref x
  UNION ALL SELECT 'filas:atlas_sales.bnpl_purchases' AS k, count(*)::text AS v FROM atlas_sales.bnpl_purchases
  UNION ALL SELECT 'md5:atlas_sales.bnpl_purchases', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.bnpl_purchases x
  UNION ALL SELECT 'filas:atlas_sales.bnpl_installments' AS k, count(*)::text AS v FROM atlas_sales.bnpl_installments
  UNION ALL SELECT 'md5:atlas_sales.bnpl_installments', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.bnpl_installments x
  UNION ALL SELECT 'filas:atlas_sales.merchant_payables' AS k, count(*)::text AS v FROM atlas_sales.merchant_payables
  UNION ALL SELECT 'md5:atlas_sales.merchant_payables', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.merchant_payables x
  UNION ALL SELECT 'filas:atlas_sales.merchant_payable_settlements' AS k, count(*)::text AS v FROM atlas_sales.merchant_payable_settlements
  UNION ALL SELECT 'md5:atlas_sales.merchant_payable_settlements', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.merchant_payable_settlements x
  UNION ALL SELECT 'filas:atlas_sales.consumer_recovery_receivables' AS k, count(*)::text AS v FROM atlas_sales.consumer_recovery_receivables
  UNION ALL SELECT 'md5:atlas_sales.consumer_recovery_receivables', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.consumer_recovery_receivables x
  UNION ALL SELECT 'filas:atlas_sales.consumer_recovery_movements' AS k, count(*)::text AS v FROM atlas_sales.consumer_recovery_movements
  UNION ALL SELECT 'md5:atlas_sales.consumer_recovery_movements', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.consumer_recovery_movements x
  UNION ALL SELECT 'filas:atlas_sales.merchant_invoices' AS k, count(*)::text AS v FROM atlas_sales.merchant_invoices
  UNION ALL SELECT 'md5:atlas_sales.merchant_invoices', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.merchant_invoices x
  UNION ALL SELECT 'filas:atlas_sales.merchant_invoice_lines' AS k, count(*)::text AS v FROM atlas_sales.merchant_invoice_lines
  UNION ALL SELECT 'md5:atlas_sales.merchant_invoice_lines', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.merchant_invoice_lines x
  UNION ALL SELECT 'filas:atlas_sales.merchant_receivables' AS k, count(*)::text AS v FROM atlas_sales.merchant_receivables
  UNION ALL SELECT 'md5:atlas_sales.merchant_receivables', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_sales.merchant_receivables x
  UNION ALL SELECT 'filas:atlas_accounting.legal_entity' AS k, count(*)::text AS v FROM atlas_accounting.legal_entity
  UNION ALL SELECT 'md5:atlas_accounting.legal_entity', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.legal_entity x
  UNION ALL SELECT 'filas:atlas_accounting.accounting_period' AS k, count(*)::text AS v FROM atlas_accounting.accounting_period
  UNION ALL SELECT 'md5:atlas_accounting.accounting_period', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.accounting_period x
  UNION ALL SELECT 'filas:atlas_accounting.gl_account' AS k, count(*)::text AS v FROM atlas_accounting.gl_account
  UNION ALL SELECT 'md5:atlas_accounting.gl_account', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.gl_account x
  UNION ALL SELECT 'filas:atlas_accounting.business_partner' AS k, count(*)::text AS v FROM atlas_accounting.business_partner
  UNION ALL SELECT 'md5:atlas_accounting.business_partner', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.business_partner x
  UNION ALL SELECT 'filas:atlas_accounting.accounting_document' AS k, count(*)::text AS v FROM atlas_accounting.accounting_document
  UNION ALL SELECT 'md5:atlas_accounting.accounting_document', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.accounting_document x
  UNION ALL SELECT 'filas:atlas_accounting.journal_entry' AS k, count(*)::text AS v FROM atlas_accounting.journal_entry
  UNION ALL SELECT 'md5:atlas_accounting.journal_entry', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.journal_entry x
  UNION ALL SELECT 'filas:atlas_accounting.journal_entry_line' AS k, count(*)::text AS v FROM atlas_accounting.journal_entry_line
  UNION ALL SELECT 'md5:atlas_accounting.journal_entry_line', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.journal_entry_line x
  UNION ALL SELECT 'filas:atlas_accounting.erp_file' AS k, count(*)::text AS v FROM atlas_accounting.erp_file
  UNION ALL SELECT 'md5:atlas_accounting.erp_file', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.erp_file x
  UNION ALL SELECT 'filas:atlas_accounting.event_outbox' AS k, count(*)::text AS v FROM atlas_accounting.event_outbox
  UNION ALL SELECT 'md5:atlas_accounting.event_outbox', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.event_outbox x
  UNION ALL SELECT 'filas:atlas_accounting.event_inbox' AS k, count(*)::text AS v FROM atlas_accounting.event_inbox
  UNION ALL SELECT 'md5:atlas_accounting.event_inbox', coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM atlas_accounting.event_inbox x
  UNION ALL SELECT 'cxp_por_estado:'||status::text, count(*)||' / '||sum(amount) FROM atlas_sales.merchant_payables GROUP BY status::text
  UNION ALL SELECT 'liquidaciones_por_estado:'||status::text, count(*)||' / '||sum(amount) FROM atlas_sales.merchant_payable_settlements GROUP BY status::text
  UNION ALL SELECT 'cxc_recuperacion_por_estado:'||recovery_status::text, count(*)||' / '||sum(amount_covered_by_atlas)||' / '||sum(amount_recovered) FROM atlas_sales.consumer_recovery_receivables GROUP BY recovery_status::text
  UNION ALL SELECT 'movimientos_por_tipo:'||movement_type, count(*)||' / '||sum(amount) FROM atlas_sales.consumer_recovery_movements GROUP BY movement_type
  UNION ALL SELECT 'documentos_por_estado:'||status::text, count(*)::text FROM atlas_accounting.accounting_document GROUP BY status::text
  UNION ALL SELECT 'asientos_por_estado:'||posting_status::text, count(*)::text FROM atlas_accounting.journal_entry GROUP BY posting_status::text
  UNION ALL SELECT 'outbox_por_estado:'||status, count(*)::text FROM atlas_accounting.event_outbox GROUP BY status
  UNION ALL SELECT 'outbox_por_topico:'||topic, count(*)::text FROM atlas_accounting.event_outbox GROUP BY topic
  UNION ALL SELECT 'cuotas_por_estado:'||status::text, count(*)||' / '||sum(amount) FROM atlas_sales.bnpl_installments GROUP BY status::text
  UNION ALL SELECT 'saldo_cuenta:'||l.gl_account_id, sum(l.debit)||' / '||sum(l.credit) FROM atlas_accounting.journal_entry_line l GROUP BY l.gl_account_id
  UNION ALL SELECT 'saldo_cuenta_contabilizado:'||l.gl_account_id, sum(l.debit)||' / '||sum(l.credit) FROM atlas_accounting.journal_entry_line l JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id WHERE j.posting_status IN ('POSTED','REVERSED') GROUP BY l.gl_account_id
  UNION ALL SELECT 'balance_debe_menos_haber', coalesce(sum(debit - credit), 0)::numeric(18,2)::text FROM atlas_accounting.journal_entry_line
  UNION ALL SELECT 'asientos_descuadrados', count(*)::text FROM (SELECT journal_entry_id FROM atlas_accounting.journal_entry_line GROUP BY journal_entry_id HAVING sum(debit) <> sum(credit)) d
  UNION ALL SELECT 'saldo_cxp_comercio_abierta', coalesce(sum(amount), 0)::text FROM atlas_sales.merchant_payables WHERE status::text NOT IN ('PAID','CANCELLED')
  UNION ALL SELECT 'saldo_cxc_recuperacion', coalesce(sum(amount_covered_by_atlas - amount_recovered), 0)::text FROM atlas_sales.consumer_recovery_receivables
  UNION ALL SELECT 'saldo_cxc_comercio', coalesce(sum(amount_open), 0)::text FROM atlas_sales.merchant_receivables
  UNION ALL SELECT 'cxp_vivas_duplicadas_por_cuota', count(*)::text FROM (SELECT installment_id FROM atlas_sales.merchant_payables WHERE status::text <> 'CANCELLED' GROUP BY installment_id HAVING count(*) > 1) d
  UNION ALL SELECT 'cxc_recuperacion_duplicadas', count(*)::text FROM (SELECT merchant_payable_id FROM atlas_sales.consumer_recovery_receivables GROUP BY merchant_payable_id HAVING count(*) > 1) d
  UNION ALL SELECT 'cobros_duplicados_por_referencia', count(*)::text FROM (SELECT payment_reference FROM atlas_sales.consumer_recovery_movements GROUP BY payment_reference HAVING count(*) > 1) d
  UNION ALL SELECT 'recuperado_distinto_de_movimientos', count(*)::text FROM atlas_sales.consumer_recovery_receivables r WHERE r.amount_recovered <> coalesce((SELECT sum(CASE WHEN m.movement_type = 'PAYMENT' THEN m.amount ELSE -m.amount END) FROM atlas_sales.consumer_recovery_movements m WHERE m.recovery_id = r.id), 0)
  UNION ALL SELECT 'secuencia:event_outbox_id_seq', last_value::text FROM atlas_accounting.event_outbox_id_seq
) controles
ORDER BY 1;
