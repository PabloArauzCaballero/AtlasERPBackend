import { defineDomain, labelled } from '../../../common/catalog/domain';
import { SEGMENT_OPERATORS } from '../../../common/segmentation/rule-engine';
import {
  AccountLifecycleStatus,
  AccountType,
  BillingTiming,
  BranchStatus,
  ChecklistStatus,
  ContractStatus,
  InvoiceStatus,
  OpportunityStage,
  OpportunityType,
  PayableStatus,
  ProposalStatus,
  ReceivableStatus,
  RecoveryStatus,
  TermType,
} from '../../b2b-sales-crm/b2b-sales-crm.enums';
import {
  ONBOARDING_CASE_STATUSES,
  ONBOARDING_SCOPES,
} from '../../b2b-sales-crm/domain/onboarding-lifecycle';
import { SEGMENT_SUBJECTS } from '../../b2b-sales-crm/domain/crm-segments';

/**
 * Vocabulario del CRM comercial B2B.
 *
 * Los `enum` de TypeScript siguen siendo la fuente de los códigos; aquí sólo se les pone nombre.
 * Los que tienen un tipo ENUM de Postgres lo declaran, y la prueba de contrato los compara.
 */

export const accountTypeDomain = defineDomain(
  'crm.accountType',
  'Clase de cuenta comercial.',
  labelled(Object.values(AccountType), {
    MERCHANT: 'Comercio afiliado',
    PARTNER: 'Aliado',
    DISTRIBUTOR: 'Distribuidor',
    FINANCIAL_ALLY: 'Aliado financiero',
  }),
  [{ enumType: 'atlas_sales.account_type' }],
);

export const accountLifecycleStatusDomain = defineDomain(
  'crm.accountLifecycleStatus',
  'Punto del ciclo comercial en el que está una cuenta.',
  labelled(Object.values(AccountLifecycleStatus), {
    LEAD: 'Prospecto',
    QUALIFIED: 'Calificada',
    CUSTOMER: 'Cliente',
    SUSPENDED: 'Suspendida',
    TERMINATED: 'Terminada',
    DISQUALIFIED: 'Descartada',
  }),
  [{ enumType: 'atlas_sales.account_status' }],
);

export const opportunityStageDomain = defineDomain(
  'crm.opportunityStage',
  'Etapa del embudo en la que está una oportunidad.',
  labelled(Object.values(OpportunityStage), {
    DISCOVERY: 'Descubrimiento',
    QUALIFICATION: 'Calificación',
    PROPOSAL: 'Propuesta',
    NEGOTIATION: 'Negociación',
    CONTRACTING: 'Contratación',
    CLOSED_WON: 'Ganada',
    CLOSED_LOST: { label: 'Perdida', help: 'Exige registrar el motivo de pérdida.' },
  }),
  [{ enumType: 'atlas_sales.opportunity_stage' }],
);

/*
 * Dos pantallas ofrecían dos listas distintas para este mismo campo (calificar una cuenta sólo
 * dejaba NEW_MERCHANT/EXPANSION/RENEWAL, y EXPANSION no existe). La lista es la del enum.
 */
export const opportunityTypeDomain = defineDomain(
  'crm.opportunityType',
  'Qué persigue una oportunidad comercial.',
  labelled(Object.values(OpportunityType), {
    NEW_MERCHANT: 'Comercio nuevo',
    RENEWAL: 'Renovación',
    UPSELL: 'Ampliación (upsell)',
    CROSS_SELL: 'Venta cruzada',
    REACTIVATION: 'Reactivación',
  }),
  [{ enumType: 'atlas_sales.opportunity_type' }],
);

export const proposalStatusDomain = defineDomain(
  'crm.proposalStatus',
  'Estado de una propuesta comercial.',
  labelled(Object.values(ProposalStatus), {
    DRAFT: 'Borrador',
    PENDING_APPROVAL: 'Pendiente de aprobación',
    SENT: 'Enviada al cliente',
    ACCEPTED: 'Aceptada',
    REJECTED: 'Rechazada',
  }),
);

export const approvalDecisionDomain = defineDomain(
  'crm.approvalDecision',
  'Decisión sobre una solicitud de aprobación.',
  labelled(['APPROVED', 'REJECTED'] as const, { APPROVED: 'Aprobar', REJECTED: 'Rechazar' }),
);

export const termTypeDomain = defineDomain(
  'crm.termType',
  'Clase de término comercial de una propuesta o contrato.',
  labelled(Object.values(TermType), {
    MDR: { label: 'Comisión por venta (MDR)', help: 'Porcentaje sobre lo que vende el comercio.' },
    SUBSCRIPTION: 'Suscripción',
    SETUP_FEE: 'Cargo de alta',
    SERVICE_FEE: 'Cargo por servicio',
    PENALTY: 'Penalidad',
    MINIMUM_MONTHLY_FEE: 'Mínimo mensual',
  }),
  [{ enumType: 'atlas_sales.term_type' }],
);

export const billingTimingDomain = defineDomain(
  'crm.billingTiming',
  'Cuándo se factura un término comercial.',
  labelled(Object.values(BillingTiming), {
    PER_TRANSACTION: 'Por transacción',
    MONTHLY: 'Mensual',
    ONE_TIME: 'Una sola vez',
    ON_DEMAND: 'Bajo demanda',
  }),
  [{ enumType: 'atlas_sales.billing_timing' }],
);

/*
 * Ciclo de facturación y política de liquidación de un contrato. Eran texto libre en el esquema;
 * en dev sólo existen MONTHLY y PER_CONTRACT (los defectos), así que cerrarlos no deja ninguna fila
 * fuera. La migración del 2026-09-15 añade el CHECK como NOT VALID: protege lo nuevo sin reescribir
 * lo que ya hay.
 */
export const contractBillingCycleDomain = defineDomain(
  'crm.contractBillingCycle',
  'Cada cuánto se factura un contrato comercial.',
  labelled(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const, {
    MONTHLY: 'Mensual',
    QUARTERLY: 'Trimestral',
    SEMIANNUAL: 'Semestral',
    ANNUAL: 'Anual',
  }),
  [{ check: 'ck_b2b_contracts_billing_cycle' }],
);

export const contractSettlementPolicyDomain = defineDomain(
  'crm.contractSettlementPolicy',
  'Cómo se agrupa la liquidación al comercio.',
  labelled(['PER_CONTRACT', 'PER_BRANCH', 'PER_ACCOUNT'] as const, {
    PER_CONTRACT: { label: 'Por contrato', help: 'Una liquidación por cada contrato.' },
    PER_BRANCH: { label: 'Por sucursal', help: 'Una liquidación por cada sucursal del comercio.' },
    PER_ACCOUNT: {
      label: 'Consolidada por cuenta',
      help: 'Una sola liquidación con todos los contratos de la cuenta.',
    },
  }),
  [{ check: 'ck_b2b_contracts_settlement_policy' }],
);

export const contractStatusDomain = defineDomain(
  'crm.contractStatus',
  'Estado de un contrato comercial.',
  labelled(Object.values(ContractStatus), {
    DRAFT: 'Borrador',
    PENDING_SIGNATURE: 'Pendiente de firma',
    ACTIVE: 'Vigente',
    EXPIRED: 'Vencido',
    TERMINATED: 'Terminado',
    SUSPENDED: 'Suspendido',
  }),
  [{ enumType: 'atlas_sales.contract_status' }],
);

export const merchantInvoiceStatusDomain = defineDomain(
  'crm.merchantInvoiceStatus',
  'Estado de una factura a comercio.',
  labelled(Object.values(InvoiceStatus), {
    DRAFT: 'Borrador',
    ISSUED: 'Emitida',
    PARTIALLY_PAID: 'Pagada en parte',
    PAID: 'Pagada',
    OVERDUE: 'Vencida',
    CANCELLED: 'Anulada',
  }),
  [{ enumType: 'atlas_sales.invoice_status' }],
);

export const receivableStatusDomain = defineDomain(
  'crm.receivableStatus',
  'Estado de una cuenta por cobrar a comercio.',
  labelled(Object.values(ReceivableStatus), {
    PENDING: 'Pendiente',
    PARTIALLY_PAID: 'Pagada en parte',
    PAID: 'Pagada',
    OVERDUE: 'Vencida',
    CANCELLED: 'Anulada',
    DISPUTED: 'En disputa',
  }),
  [{ enumType: 'atlas_sales.receivable_status' }],
);

export const payableStatusDomain = defineDomain(
  'crm.payableStatus',
  'Estado de un pago programado al comercio.',
  labelled(Object.values(PayableStatus), {
    SCHEDULED: 'Programado',
    DUE: 'Por pagar',
    PAID: 'Pagado',
    CANCELLED: 'Anulado',
    DISPUTED: 'En disputa',
  }),
  [{ enumType: 'atlas_sales.payable_status' }],
);

export const recoveryStatusDomain = defineDomain(
  'crm.recoveryStatus',
  'Estado de un recobro al cliente.',
  labelled(Object.values(RecoveryStatus), {
    OPEN: 'Abierto',
    IN_COLLECTION: 'En cobranza',
    PARTIALLY_RECOVERED: 'Recuperado en parte',
    RECOVERED: 'Recuperado',
    WRITTEN_OFF: 'Castigado',
  }),
  [{ enumType: 'atlas_sales.recovery_status' }],
);

export const branchStatusDomain = defineDomain(
  'crm.branchStatus',
  'Estado de una sucursal de comercio.',
  labelled(Object.values(BranchStatus), {
    PENDING: 'Pendiente',
    ACTIVE: 'Activa',
    INACTIVE: 'Inactiva',
    SUSPENDED: 'Suspendida',
  }),
);

export const merchantUserStatusDomain = defineDomain(
  'crm.merchantUserStatus',
  'Estado de acceso de una persona del comercio.',
  labelled(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const, {
    INVITED: 'Invitado',
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    DISABLED: 'Deshabilitado',
  }),
  [{ check: 'ck_merchant_users_status' }],
);

export const onboardingCaseStatusDomain = defineDomain(
  'crm.onboardingCaseStatus',
  'Posición de un caso de alta de comercio en la cadena ERP → Motor → Portal → ERP.',
  labelled(ONBOARDING_CASE_STATUSES, {
    OPEN: 'Abierto',
    IN_PROGRESS: { label: 'En curso', help: 'Valor heredado; equivale a abierto.' },
    BLOCKED: { label: 'Bloqueado', help: 'Valor heredado; equivale a revisión.' },
    EN_VERIFICACION: 'En verificación',
    REVISION_MANUAL: 'En revisión manual',
    RECHAZADO: 'Rechazado',
    VERIFICADO: 'Verificado',
    ALTA_PENDIENTE: 'Credenciales pedidas',
    LISTO: 'Listo para activar',
    COMPLETED: 'Activado',
  }),
);

export const onboardingScopeDomain = defineDomain(
  'crm.onboardingScope',
  'Qué casos de alta enseña la cola.',
  labelled(ONBOARDING_SCOPES, {
    abiertos: 'Abiertos',
    historial: 'Historial',
    todos: 'Todos',
  }),
);

export const checklistStatusDomain = defineDomain(
  'crm.checklistStatus',
  'Estado de un requisito del alta de comercio.',
  labelled(Object.values(ChecklistStatus), {
    PENDING: 'Pendiente',
    COMPLETED: 'Cumplido',
    WAIVED: {
      label: 'Dispensado',
      help: 'No se exige para este comercio; queda registrado quién lo dispensó.',
    },
    BLOCKED: 'Bloqueado',
  }),
);

export const checklistItemTypeDomain = defineDomain(
  'crm.checklistItemType',
  'Área a la que pertenece un requisito del alta de comercio.',
  labelled(['LEGAL', 'OPERATIONS', 'TECHNICAL', 'FINANCE', 'COMPLIANCE'] as const, {
    LEGAL: 'Legal',
    OPERATIONS: 'Operaciones',
    TECHNICAL: 'Técnico',
    FINANCE: 'Finanzas',
    COMPLIANCE: 'Cumplimiento',
  }),
);

export const activityTypeDomain = defineDomain(
  'crm.activityType',
  'Clase de actividad comercial registrada.',
  labelled(['NOTE', 'CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'VISIT', 'TASK', 'OTHER'] as const, {
    NOTE: 'Nota',
    CALL: 'Llamada',
    MEETING: 'Reunión',
    EMAIL: 'Correo',
    WHATSAPP: 'WhatsApp',
    VISIT: 'Visita',
    TASK: 'Tarea',
    OTHER: 'Otra',
  }),
);

export const segmentSubjectDomain = defineDomain(
  'crm.segmentSubject',
  'A quién agrupa un segmento comercial.',
  labelled(SEGMENT_SUBJECTS, {
    CREDIT_APPLICANT: 'Clientes solicitantes de crédito',
    PARTNER: 'Comercios y aliados',
  }),
  [{ check: 'ck_crm_segments_subject' }],
);

export const segmentStatusDomain = defineDomain(
  'crm.segmentStatus',
  'Estado de un segmento comercial.',
  labelled(['ACTIVE', 'INACTIVE'] as const, { ACTIVE: 'Activo', INACTIVE: 'Inactivo' }),
  [{ check: 'ck_crm_segments_status' }],
);

export const segmentOperatorDomain = defineDomain(
  'platform.segmentOperator',
  'Cómo compara una regla de segmento.',
  labelled(SEGMENT_OPERATORS, {
    EQUALS: 'Es igual a',
    NOT_EQUALS: 'Es distinto de',
    IN: { label: 'Está entre', help: 'Varios valores separados por coma.' },
    NOT_IN: { label: 'No está entre', help: 'Varios valores separados por coma.' },
    BETWEEN: { label: 'Entre dos números', help: 'Mínimo y máximo, separados por coma.' },
    EXISTS: 'Tiene valor',
  }),
);

export const segmentMatchDomain = defineDomain(
  'platform.segmentMatch',
  'Cómo se combinan las reglas de un segmento.',
  labelled(['ALL', 'ANY'] as const, {
    ALL: 'Cumple todas las reglas',
    ANY: 'Cumple al menos una regla',
  }),
);

/*
 * Banda de riesgo COMERCIAL de una cuenta. Era texto libre y en dev está NULL en todas las filas:
 * la lista es la que el frontend ya ofrecía en el alta.
 */
export const riskTierDomain = defineDomain(
  'crm.riskTier',
  'Banda de riesgo comercial asignada a una cuenta o a una compra.',
  labelled(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const, {
    LOW: 'Bajo',
    MEDIUM: 'Medio',
    HIGH: 'Alto',
    CRITICAL: 'Crítico',
  }),
);

/*
 * Rubro del comercio. AtlasBackend es el dueño (`PARTNER_BUSINESS_CATEGORIES`) y los códigos tienen
 * que coincidir EXACTAMENTE: agrupan el gasto del cliente y segmentan la comisión. Antes cada
 * pantalla del ERP lo copiaba; ahora hay una sola copia en el ERP, aquí.
 */
export const merchantCategoryDomain = defineDomain(
  'crm.merchantCategory',
  'Rubro comercial del comercio afiliado.',
  labelled(
    [
      'RETAIL',
      'SERVICIOS',
      'EDUCACION',
      'SALUD',
      'ALIMENTOS',
      'TECNOLOGIA',
      'HOGAR',
      'VESTIMENTA',
      'AUTOMOTOR',
      'CONSTRUCCION',
      'TURISMO',
      'OTRO',
    ] as const,
    {
      RETAIL: 'Retail / Comercio',
      SERVICIOS: 'Servicios profesionales',
      EDUCACION: 'Educación',
      SALUD: 'Salud y farmacia',
      ALIMENTOS: 'Alimentos y bebidas',
      TECNOLOGIA: 'Tecnología y electrónica',
      HOGAR: 'Hogar y muebles',
      VESTIMENTA: 'Vestimenta y calzado',
      AUTOMOTOR: 'Automotor y repuestos',
      CONSTRUCCION: 'Construcción y ferretería',
      TURISMO: 'Turismo y transporte',
      OTRO: 'Otro',
    },
  ),
);

export const industryDomain = defineDomain(
  'crm.industry',
  'Industria de una cuenta comercial.',
  labelled(
    [
      'RETAIL',
      'SERVICES',
      'MANUFACTURING',
      'TECHNOLOGY',
      'FINANCE',
      'HEALTHCARE',
      'EDUCATION',
      'LOGISTICS',
      'FOOD_BEVERAGE',
      'OTHER',
    ] as const,
    {
      RETAIL: 'Retail / Comercio',
      SERVICES: 'Servicios',
      MANUFACTURING: 'Manufactura',
      TECHNOLOGY: 'Tecnología',
      FINANCE: 'Finanzas',
      HEALTHCARE: 'Salud',
      EDUCATION: 'Educación',
      LOGISTICS: 'Transporte y logística',
      FOOD_BEVERAGE: 'Alimentos y bebidas',
      OTHER: 'Otro',
    },
  ),
);

export const businessLineDomain = defineDomain(
  'crm.businessLine',
  'Actividad principal de una cuenta comercial.',
  labelled(
    [
      'ELECTRODOMESTICOS',
      'ABARROTES',
      'FARMACIA',
      'RESTAURANTE',
      'PREPARACION_ACADEMICA',
      'INSTITUCION_EDUCATIVA',
      'ROPA_CALZADO',
      'MUEBLERIA',
      'FERRETERIA',
      'TALLER_REPUESTOS',
      'VIAJES_TRANSPORTE',
      'SERVICIOS_PROFESIONALES',
      'OTRO',
    ] as const,
    {
      ELECTRODOMESTICOS: 'Venta de electrodomésticos y tecnología',
      ABARROTES: 'Supermercado y abarrotes',
      FARMACIA: 'Farmacia',
      RESTAURANTE: 'Restaurante y comida rápida',
      PREPARACION_ACADEMICA: 'Preparación académica y cursos',
      INSTITUCION_EDUCATIVA: 'Colegio o instituto',
      ROPA_CALZADO: 'Tienda de ropa y calzado',
      MUEBLERIA: 'Mueblería y decoración',
      FERRETERIA: 'Ferretería y materiales',
      TALLER_REPUESTOS: 'Taller y repuestos',
      VIAJES_TRANSPORTE: 'Agencia de viajes y transporte',
      SERVICIOS_PROFESIONALES: 'Servicios profesionales',
      OTRO: 'Otro',
    },
  ),
);

export const contactRoleTitleDomain = defineDomain(
  'crm.contactRoleTitle',
  'Cargo del contacto de una cuenta.',
  labelled(
    [
      'PROPIETARIO',
      'GERENTE_GENERAL',
      'GERENTE_COMERCIAL',
      'GERENTE_FINANZAS',
      'GERENTE_OPERACIONES',
      'ADMINISTRADOR',
      'CONTADOR',
      'ENCARGADO_SUCURSAL',
      'VENDEDOR',
      'OTRO',
    ] as const,
    {
      PROPIETARIO: 'Propietario / Dueño',
      GERENTE_GENERAL: 'Gerente general',
      GERENTE_COMERCIAL: 'Gerente comercial',
      GERENTE_FINANZAS: 'Gerente de finanzas',
      GERENTE_OPERACIONES: 'Gerente de operaciones',
      ADMINISTRADOR: 'Administrador',
      CONTADOR: 'Contador',
      ENCARGADO_SUCURSAL: 'Encargado de sucursal',
      VENDEDOR: 'Vendedor / Cajero',
      OTRO: 'Otro',
    },
  ),
);

export const decisionRoleDomain = defineDomain(
  'crm.decisionRole',
  'Peso del contacto en la decisión de compra.',
  labelled(['DECISOR', 'INFLUENCIADOR', 'APROBADOR', 'USUARIO', 'GESTOR', 'BLOQUEADOR'] as const, {
    DECISOR: 'Decisor final',
    INFLUENCIADOR: 'Influenciador',
    APROBADOR: 'Aprobador de presupuesto',
    USUARIO: 'Usuario del servicio',
    GESTOR: 'Contacto de gestión',
    BLOQUEADOR: 'Bloqueador / Portero',
  }),
);

export const CRM_DOMAINS = [
  accountTypeDomain,
  accountLifecycleStatusDomain,
  opportunityStageDomain,
  opportunityTypeDomain,
  proposalStatusDomain,
  approvalDecisionDomain,
  termTypeDomain,
  billingTimingDomain,
  contractBillingCycleDomain,
  contractSettlementPolicyDomain,
  contractStatusDomain,
  merchantInvoiceStatusDomain,
  receivableStatusDomain,
  payableStatusDomain,
  recoveryStatusDomain,
  branchStatusDomain,
  merchantUserStatusDomain,
  onboardingCaseStatusDomain,
  onboardingScopeDomain,
  checklistStatusDomain,
  checklistItemTypeDomain,
  activityTypeDomain,
  segmentSubjectDomain,
  segmentStatusDomain,
  segmentOperatorDomain,
  segmentMatchDomain,
  riskTierDomain,
  merchantCategoryDomain,
  industryDomain,
  businessLineDomain,
  contactRoleTitleDomain,
  decisionRoleDomain,
] as const;
