import { defineDomain, labelled } from '../../../common/catalog/domain';
import {
  BASES_DE_COMPUTO,
  ESTADOS_CONDICION,
  FRECUENCIAS,
  MEDIOS_DE_PAGO,
  MODALIDADES_DE_PAGO,
} from '../../accounting/supplier-payment-terms/payment-terms.catalog';

/**
 * Vocabulario de contabilidad.
 *
 * Los que ya tenían CHECK en la base lo declaran en `database`: la prueba de contrato compara la
 * lista con la migración y se pone en rojo si divergen.
 */

const fromCatalog = <T extends Record<string, { code: string; label: string; help?: string }>>(
  source: T,
) =>
  Object.values(source).map((entry) => ({
    code: entry.code as Extract<keyof T, string>,
    label: entry.label,
    ...(entry.help ? { help: entry.help } : {}),
  }));

export const recordStatusDomain = defineDomain(
  'accounting.recordStatus',
  'Estado de un dato maestro contable (grupo de cuenta, plan, entidad).',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: 'Activo',
    INACTIVE: 'Inactivo',
    ARCHIVED: 'Archivado',
  }),
);

/*
 * `ARCHIVED` se añadió al CHECK el 2026-09-15 (migración de dominios alineados): el esquema lo
 * aceptaba desde el principio y el CHECK no, así que archivar una cuenta devolvía un 500.
 */
export const glAccountStatusDomain = defineDomain(
  'accounting.glAccountStatus',
  'Estado de una cuenta contable.',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: 'Activa',
    INACTIVE: { label: 'Inactiva', help: 'No admite asientos nuevos; conserva su historial.' },
    ARCHIVED: { label: 'Archivada', help: 'Retirada del plan; sólo se consulta.' },
  }),
  [{ check: 'chk_gl_account_status' }],
);

export const businessPartnerStatusDomain = defineDomain(
  'accounting.businessPartnerStatus',
  'Estado de un business partner.',
  labelled(['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'] as const, {
    ACTIVE: 'Activo',
    INACTIVE: 'Inactivo',
    BLOCKED: { label: 'Bloqueado', help: 'No se le puede facturar ni pagar hasta desbloquearlo.' },
    ARCHIVED: 'Archivado',
  }),
  [{ check: 'chk_bp_status' }],
);

export const glAccountTypeDomain = defineDomain(
  'accounting.glAccountType',
  'Naturaleza de una cuenta contable.',
  labelled(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_ASSET'] as const, {
    ASSET: 'Activo',
    LIABILITY: 'Pasivo',
    EQUITY: 'Patrimonio',
    REVENUE: 'Ingreso',
    EXPENSE: 'Gasto',
    CONTRA_ASSET: { label: 'Contra-activo', help: 'Resta de un activo: depreciación, previsión.' },
  }),
  [{ check: 'chk_gl_account_type' }],
);

export const normalBalanceDomain = defineDomain(
  'accounting.normalBalance',
  'Lado en el que crece el saldo de una cuenta.',
  labelled(['D', 'C'] as const, { D: 'Débito', C: 'Crédito' }),
);

export const partnerTypeDomain = defineDomain(
  'accounting.partnerType',
  'Tipo de business partner.',
  labelled(['PERSON', 'COMPANY', 'BANK', 'GROUP_ENTITY', 'GOVERNMENT'] as const, {
    PERSON: 'Persona',
    COMPANY: 'Empresa',
    BANK: 'Banco',
    GROUP_ENTITY: 'Entidad del grupo',
    GOVERNMENT: 'Entidad pública',
  }),
  [{ check: 'chk_bp_type' }],
);

export const kybStatusDomain = defineDomain(
  'accounting.kybStatus',
  'Estado de la verificación de conocimiento del cliente (KYB).',
  labelled(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const, {
    PENDING: 'Pendiente',
    IN_REVIEW: 'En revisión',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
  }),
);

export const statementTypeDomain = defineDomain(
  'accounting.statementType',
  'Estado financiero en el que se presenta un grupo de cuentas.',
  labelled(
    ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY_CHANGES', 'MEMORANDUM'] as const,
    {
      BALANCE_SHEET: 'Balance general',
      INCOME_STATEMENT: 'Estado de resultados',
      CASH_FLOW: 'Flujo de efectivo',
      EQUITY_CHANGES: 'Cambios en el patrimonio',
      MEMORANDUM: 'Cuentas de orden',
    },
  ),
  [{ check: 'chk_gl_account_group_statement' }],
);

export const accountClassificationDomain = defineDomain(
  'accounting.accountClassification',
  'Clasificación principal de un grupo de cuentas.',
  labelled(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const, {
    ASSET: 'Activo',
    LIABILITY: 'Pasivo',
    EQUITY: 'Patrimonio',
    REVENUE: 'Ingreso',
    EXPENSE: 'Gasto',
  }),
  [{ check: 'chk_gl_account_group_classification' }],
);

/*
 * Medido en la base de dev el 2026-09-15: los grupos sembrados usan estos trece valores. Era texto
 * libre, así que la lista sale de lo que ya está guardado y no de lo que sugería el placeholder
 * («CURRENT / NON_CURRENT…»): cerrarlo a dos valores habría dejado sin editar diez grupos reales.
 */
export const accountSubClassificationDomain = defineDomain(
  'accounting.accountSubClassification',
  'Subclasificación de un grupo de cuentas dentro de su estado financiero.',
  labelled(
    [
      'CURRENT',
      'NON_CURRENT',
      'CAPITAL',
      'RESERVES',
      'RESULTS',
      'OCI',
      'OPERATING',
      'NON_OPERATING',
      'COST_OF_SERVICE',
      'FINANCIAL',
      'DEPRECIATION',
      'CREDIT_LOSS',
      'TAX',
    ] as const,
    {
      CURRENT: 'Corriente',
      NON_CURRENT: 'No corriente',
      CAPITAL: 'Capital',
      RESERVES: 'Reservas',
      RESULTS: 'Resultados acumulados',
      OCI: {
        label: 'Otro resultado integral',
        help: 'Partidas que no pasan por resultados (ORI).',
      },
      OPERATING: 'Operativo',
      NON_OPERATING: 'No operativo',
      COST_OF_SERVICE: 'Costo del servicio',
      FINANCIAL: 'Financiero',
      DEPRECIATION: 'Depreciación y amortización',
      CREDIT_LOSS: 'Pérdida crediticia',
      TAX: 'Impuestos',
    },
  ),
);

export const entityLinkTypeDomain = defineDomain(
  'accounting.entityLinkType',
  'A qué clase de registro se ata una cuenta o un asiento.',
  labelled(
    [
      'BUSINESS_PARTNER',
      'COST_CENTER',
      'PROFIT_CENTER',
      'CONTRACT',
      'LEGAL_ENTITY',
      'TAX_CODE',
      'BANK_ACCOUNT',
      'LEDGER',
      'BRANCH',
      'ACCOUNTING_DOCUMENT',
      'OTHER',
    ] as const,
    {
      BUSINESS_PARTNER: 'Business partner',
      COST_CENTER: 'Centro de costo',
      PROFIT_CENTER: 'Centro de beneficio',
      CONTRACT: 'Contrato',
      LEGAL_ENTITY: 'Entidad legal',
      TAX_CODE: 'Código de impuesto',
      BANK_ACCOUNT: 'Cuenta bancaria',
      LEDGER: 'Ledger',
      BRANCH: 'Sucursal',
      ACCOUNTING_DOCUMENT: 'Documento contable',
      OTHER: 'Otro',
    },
  ),
);

export const entityLinkRelationDomain = defineDomain(
  'accounting.entityLinkRelation',
  'Para qué se ata una cuenta a otro registro.',
  labelled(
    [
      'DEFAULT',
      'AR_CONTROL',
      'AP_CONTROL',
      'ADVANCE',
      'SURCHARGE',
      'REVENUE',
      'EXPENSE',
      'TAX',
    ] as const,
    {
      DEFAULT: 'Por defecto',
      AR_CONTROL: 'Cuentas por cobrar (control)',
      AP_CONTROL: 'Cuentas por pagar (control)',
      ADVANCE: 'Anticipos',
      SURCHARGE: 'Recargos',
      REVENUE: 'Ingreso',
      EXPENSE: 'Gasto',
      TAX: 'Impuesto',
    },
  ),
);

export const partnerAccountPurposeDomain = defineDomain(
  'accounting.partnerAccountPurpose',
  'Para qué usa un business partner cada cuenta por defecto.',
  labelled(
    [
      'AR_CONTROL',
      'AP_CONTROL',
      'CUSTOMER_ADVANCES',
      'SUPPLIER_ADVANCES',
      'SURCHARGES',
      'DISCOUNTS',
      'WITHHOLDINGS',
    ] as const,
    {
      AR_CONTROL: 'Cuentas por cobrar (control)',
      AP_CONTROL: 'Cuentas por pagar (control)',
      CUSTOMER_ADVANCES: 'Anticipos de cliente',
      SUPPLIER_ADVANCES: 'Anticipos a proveedor',
      SURCHARGES: 'Recargos',
      DISCOUNTS: 'Descuentos',
      WITHHOLDINGS: 'Retenciones',
    },
  ),
);

export const partnerRoleDomain = defineDomain(
  'accounting.partnerRole',
  'Papel que cumple un business partner frente a una entidad legal.',
  labelled(['CUSTOMER', 'SUPPLIER', 'MERCHANT', 'LENDER', 'BANK', 'INTERCOMPANY'] as const, {
    CUSTOMER: 'Cliente',
    SUPPLIER: 'Proveedor',
    MERCHANT: 'Comercio afiliado',
    LENDER: 'Prestamista',
    BANK: 'Banco',
    INTERCOMPANY: 'Empresa del grupo',
  }),
);

export const ledgerBasisDomain = defineDomain(
  'accounting.ledgerBasis',
  'Norma contable con la que lleva el libro un ledger.',
  labelled(['LOCAL_BO', 'MANAGEMENT', 'IFRS'] as const, {
    LOCAL_BO: 'Norma local (Bolivia)',
    MANAGEMENT: 'Gestión interna',
    IFRS: 'NIIF (IFRS)',
  }),
  [{ check: 'chk_ledger_accounting_basis' }],
);

export const taxTypeDomain = defineDomain(
  'accounting.taxType',
  'Impuesto que representa un código tributario.',
  labelled(['IVA', 'IT', 'IUE', 'RETENTION', 'OTHER'] as const, {
    IVA: 'IVA — Impuesto al Valor Agregado',
    IT: 'IT — Impuesto a las Transacciones',
    IUE: 'IUE — Impuesto sobre las Utilidades',
    RETENTION: 'Retención',
    OTHER: 'Otro',
  }),
);

export const accountingContractTypeDomain = defineDomain(
  'accounting.contractType',
  'Clase de contrato contable.',
  labelled(['CUSTOMER_BILLING', 'SUPPLIER', 'LOAN', 'INTERCOMPANY', 'MERCHANT'] as const, {
    CUSTOMER_BILLING: 'Facturación a cliente',
    SUPPLIER: 'Proveedor',
    LOAN: 'Préstamo',
    INTERCOMPANY: 'Entre empresas del grupo',
    MERCHANT: 'Comercio afiliado',
  }),
);

/*
 * `contract_header.status` no tiene CHECK en la base; la validación vive sólo aquí. Por eso el
 * PATCH de contratos, que no validaba, llegó a aceptar cualquier cadena.
 */
export const accountingContractStatusDomain = defineDomain(
  'accounting.contractStatus',
  'Estado de un contrato contable.',
  labelled(['DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const, {
    DRAFT: 'Borrador',
    ACTIVE: 'Vigente',
    SUSPENDED: 'Suspendido',
    TERMINATED: 'Terminado',
  }),
);

export const billingEventTypeDomain = defineDomain(
  'accounting.billingEventType',
  'Qué origina un evento de facturación.',
  labelled(['MDR', 'SAAS', 'SETUP', 'INTERCOMPANY', 'SUPPORT'] as const, {
    MDR: { label: 'Comisión por venta (MDR)', help: 'Porcentaje sobre lo que vende el comercio.' },
    SAAS: 'Suscripción',
    SETUP: 'Cargo de alta',
    INTERCOMPANY: 'Servicio entre empresas del grupo',
    SUPPORT: 'Soporte',
  }),
);

export const arInvoiceStatusDomain = defineDomain(
  'accounting.arInvoiceStatus',
  'Estado de una factura por cobrar.',
  labelled(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CREDITED', 'VOID'] as const, {
    DRAFT: 'Borrador',
    ISSUED: 'Emitida',
    PARTIALLY_PAID: 'Pagada en parte',
    PAID: 'Pagada',
    CREDITED: { label: 'Acreditada', help: 'Anulada total o parcialmente con nota de crédito.' },
    VOID: 'Anulada',
  }),
  [{ check: 'chk_ar_invoice_status' }],
);

export const receiptStatusDomain = defineDomain(
  'accounting.receiptStatus',
  'Estado de un recibo de cobro.',
  labelled(['DRAFT', 'RECORDED', 'POSTED', 'VOID'] as const, {
    DRAFT: 'Borrador',
    RECORDED: 'Registrado',
    POSTED: 'Contabilizado',
    VOID: 'Anulado',
  }),
  [{ check: 'chk_receipt_status' }],
);

export const documentApprovalStatusDomain = defineDomain(
  'accounting.documentApprovalStatus',
  'Estado de aprobación de un documento contable.',
  labelled(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const, {
    NOT_REQUIRED: 'No requiere aprobación',
    PENDING: 'Pendiente de aprobación',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
  }),
  [{ check: 'chk_accounting_document_approval_status' }],
);

/*
 * Sistema, tipo de origen y tipo de documento. Son la clave de integración de un documento y el
 * esquema NO los cierra (un importador elige los suyos); estos dominios son los valores habituales
 * que el alta manual ofrece en un select. El backend los escribe fijos desde facturación, tesorería,
 * CRM y reversiones. La lista es la unión
 * de lo que escribe el código y de lo medido en dev. `SMOKE`/`BATCH_VALIDATION` son del guion de
 * humo de lotes, que también pasa por el esquema.
 */
export const documentSourceSystemDomain = defineDomain(
  'accounting.documentSourceSystem',
  'Sistema que origina un documento contable.',
  labelled(['ATLAS_ERP', 'ACCOUNTING', 'BILLING', 'TREASURY', 'CRM', 'ADS', 'SMOKE'] as const, {
    ATLAS_ERP: 'ERP Atlas',
    ACCOUNTING: 'Contabilidad (manual)',
    BILLING: 'Facturación',
    TREASURY: 'Tesorería',
    CRM: 'CRM comercial',
    ADS: 'Publicidad',
    SMOKE: { label: 'Prueba técnica', help: 'Sólo para las pruebas de humo del sistema.' },
  }),
);

export const documentSourceTypeDomain = defineDomain(
  'accounting.documentSourceType',
  'Clase de hecho que origina un documento contable.',
  labelled(
    [
      'MANUAL',
      'AR_INVOICE',
      'RECEIPT',
      'MERCHANT_INVOICE',
      'REVERSAL',
      'CLOSING',
      'BATCH_VALIDATION',
    ] as const,
    {
      MANUAL: 'Asiento manual',
      AR_INVOICE: 'Factura por cobrar',
      RECEIPT: 'Recibo de cobro',
      MERCHANT_INVOICE: 'Factura a comercio',
      REVERSAL: 'Reversión',
      CLOSING: 'Cierre de período',
      BATCH_VALIDATION: { label: 'Prueba técnica', help: 'Sólo para las pruebas de humo.' },
    },
  ),
);

export const documentTypeDomain = defineDomain(
  'accounting.documentType',
  'Tipo de documento contable.',
  labelled(['JOURNAL', 'AR_INVOICE', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'CLOSING'] as const, {
    JOURNAL: 'Asiento de diario',
    AR_INVOICE: 'Factura por cobrar',
    RECEIPT: 'Recibo',
    REVERSAL: 'Reversión',
    ADJUSTMENT: 'Ajuste',
    CLOSING: 'Cierre',
  }),
);

/* Estados del SIAT (Servicio de Impuestos Nacionales) para la factura electrónica. */
export const siatStatusDomain = defineDomain(
  'accounting.siatStatus',
  'Estado de la factura electrónica ante el SIAT.',
  labelled(['PENDING', 'SENT', 'ACCEPTED', 'OBSERVED', 'REJECTED', 'VOIDED'] as const, {
    PENDING: 'Pendiente de envío',
    SENT: 'Enviada',
    ACCEPTED: 'Aceptada',
    OBSERVED: 'Observada',
    REJECTED: 'Rechazada',
    VOIDED: 'Anulada ante el SIAT',
  }),
);

export const periodCloseTypeDomain = defineDomain(
  'accounting.periodCloseType',
  'Alcance de un cierre contable.',
  labelled(['MONTHLY', 'ANNUAL'] as const, { MONTHLY: 'Mensual', ANNUAL: 'Anual' }),
);

export const paymentTermModalityDomain = defineDomain(
  'accounting.paymentTermModality',
  'Cuándo nace la obligación de pagar a un proveedor.',
  fromCatalog(MODALIDADES_DE_PAGO),
  [{ check: 'ck_supplier_terms_modality' }],
);

export const paymentTermBaseDomain = defineDomain(
  'accounting.paymentTermBase',
  'Desde qué fecha corre el plazo de pago.',
  fromCatalog(BASES_DE_COMPUTO),
  [{ check: 'ck_supplier_terms_base' }],
);

export const paymentMethodDomain = defineDomain(
  'accounting.paymentMethod',
  'Instrumento con el que se paga o se cobra.',
  fromCatalog(MEDIOS_DE_PAGO),
  [{ check: 'ck_supplier_terms_method' }],
);

export const paymentFrequencyDomain = defineDomain(
  'accounting.paymentFrequency',
  'Cada cuánto se repite un pago.',
  fromCatalog(FRECUENCIAS),
  [{ check: 'ck_supplier_terms_frequency' }],
);

export const paymentTermStatusDomain = defineDomain(
  'accounting.paymentTermStatus',
  'Ciclo de vida de una condición de pago a proveedor.',
  fromCatalog(ESTADOS_CONDICION),
  [{ check: 'ck_supplier_terms_status' }],
);

export const ACCOUNTING_DOMAINS = [
  recordStatusDomain,
  glAccountStatusDomain,
  businessPartnerStatusDomain,
  glAccountTypeDomain,
  normalBalanceDomain,
  partnerTypeDomain,
  kybStatusDomain,
  statementTypeDomain,
  accountClassificationDomain,
  accountSubClassificationDomain,
  entityLinkTypeDomain,
  entityLinkRelationDomain,
  partnerAccountPurposeDomain,
  partnerRoleDomain,
  ledgerBasisDomain,
  taxTypeDomain,
  accountingContractTypeDomain,
  accountingContractStatusDomain,
  billingEventTypeDomain,
  arInvoiceStatusDomain,
  receiptStatusDomain,
  documentApprovalStatusDomain,
  documentSourceSystemDomain,
  documentSourceTypeDomain,
  documentTypeDomain,
  siatStatusDomain,
  periodCloseTypeDomain,
  paymentTermModalityDomain,
  paymentTermBaseDomain,
  paymentMethodDomain,
  paymentFrequencyDomain,
  paymentTermStatusDomain,
] as const;
