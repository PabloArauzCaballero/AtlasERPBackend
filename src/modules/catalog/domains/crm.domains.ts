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
    MERCHANT: {
      label: 'Comercio afiliado',
      help: 'Vende a los clientes de Atlas y liquida comisión por cada venta.',
    },
    PARTNER: {
      label: 'Aliado',
      help: 'Colabora sin vender directamente: convenios, referidos, difusión.',
    },
    DISTRIBUTOR: {
      label: 'Distribuidor',
      help: 'Revende el servicio y capta comercios en nombre de Atlas.',
    },
    FINANCIAL_ALLY: {
      label: 'Aliado financiero',
      help: 'Banco o entidad que fondea o procesa cobros de la operación.',
    },
  }),
  [{ enumType: 'atlas_sales.account_type' }],
);

export const accountLifecycleStatusDomain = defineDomain(
  'crm.accountLifecycleStatus',
  'Punto del ciclo comercial en el que está una cuenta.',
  labelled(Object.values(AccountLifecycleStatus), {
    LEAD: {
      label: 'Prospecto',
      help: 'Recién captada; todavía nadie comprobó si sirve como cliente.',
    },
    QUALIFIED: {
      label: 'Calificada',
      help: 'Se confirmó que encaja y puede contratar; aún no firma.',
    },
    CUSTOMER: {
      label: 'Cliente',
      help: 'Ya tiene contrato vigente y genera facturación.',
    },
    SUSPENDED: {
      label: 'Suspendida',
      help: 'Se le cortó el servicio temporalmente, por mora o incumplimiento.',
    },
    TERMINATED: {
      label: 'Terminada',
      help: 'La relación se cerró de mutuo acuerdo o por rescisión.',
    },
    DISQUALIFIED: {
      label: 'Descartada',
      help: 'No cumple los requisitos; no se la vuelve a trabajar.',
    },
  }),
  [{ enumType: 'atlas_sales.account_status' }],
);

export const opportunityStageDomain = defineDomain(
  'crm.opportunityStage',
  'Etapa del embudo en la que está una oportunidad.',
  labelled(Object.values(OpportunityStage), {
    DISCOVERY: {
      label: 'Descubrimiento',
      help: 'Se está entendiendo qué necesita el comercio y quién decide.',
    },
    QUALIFICATION: {
      label: 'Calificación',
      help: 'Se comprueba presupuesto, urgencia y capacidad de contratar.',
    },
    PROPOSAL: {
      label: 'Propuesta',
      help: 'Ya se le presentó una oferta con precios y condiciones.',
    },
    NEGOTIATION: {
      label: 'Negociación',
      help: 'Se discuten comisión, plazos o alcance antes de cerrar.',
    },
    CONTRACTING: {
      label: 'Contratación',
      help: 'Acuerdo cerrado; falta la firma y la carga de documentos.',
    },
    CLOSED_WON: {
      label: 'Ganada',
      help: 'Terminó en contrato firmado; alimenta la meta del período.',
    },
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
    NEW_MERCHANT: {
      label: 'Comercio nuevo',
      help: 'Primera afiliación: el comercio nunca operó con Atlas.',
    },
    RENEWAL: {
      label: 'Renovación',
      help: 'Extender un contrato que vence manteniendo el alcance.',
    },
    UPSELL: {
      label: 'Ampliación (upsell)',
      help: 'Subirlo de plan o añadir sucursales al contrato vigente.',
    },
    CROSS_SELL: {
      label: 'Venta cruzada',
      help: 'Venderle otro producto de Atlas, como publicidad.',
    },
    REACTIVATION: {
      label: 'Reactivación',
      help: 'Recuperar a un comercio que dejó de operar o se dio de baja.',
    },
  }),
  [{ enumType: 'atlas_sales.opportunity_type' }],
);

export const proposalStatusDomain = defineDomain(
  'crm.proposalStatus',
  'Estado de una propuesta comercial.',
  labelled(Object.values(ProposalStatus), {
    DRAFT: {
      label: 'Borrador',
      help: 'Se está armando; el cliente todavía no la ha visto.',
    },
    PENDING_APPROVAL: {
      label: 'Pendiente de aprobación',
      help: 'Sus condiciones exceden lo permitido y espera visto bueno interno.',
    },
    SENT: {
      label: 'Enviada al cliente',
      help: 'Ya está en manos del comercio y corre el plazo de respuesta.',
    },
    ACCEPTED: {
      label: 'Aceptada',
      help: 'El cliente la aprobó; de aquí sale el contrato.',
    },
    REJECTED: {
      label: 'Rechazada',
      help: 'El cliente la desestimó; conviene anotar por qué.',
    },
  }),
);

export const approvalDecisionDomain = defineDomain(
  'crm.approvalDecision',
  'Decisión sobre una solicitud de aprobación.',
  labelled(['APPROVED', 'REJECTED'] as const, {
    APPROVED: {
      label: 'Aprobar',
      help: 'Autoriza las condiciones y deja seguir el circuito comercial.',
    },
    REJECTED: {
      label: 'Rechazar',
      help: 'Deniega las condiciones; la propuesta vuelve a quien la armó.',
    },
  }),
);

export const termTypeDomain = defineDomain(
  'crm.termType',
  'Clase de término comercial de una propuesta o contrato.',
  labelled(Object.values(TermType), {
    MDR: { label: 'Comisión por venta (MDR)', help: 'Porcentaje sobre lo que vende el comercio.' },
    SUBSCRIPTION: {
      label: 'Suscripción',
      help: 'Cuota periódica fija por tener el servicio habilitado.',
    },
    SETUP_FEE: {
      label: 'Cargo de alta',
      help: 'Cobro único por la habilitación inicial del comercio.',
    },
    SERVICE_FEE: {
      label: 'Cargo por servicio',
      help: 'Prestación puntual facturada aparte del plan contratado.',
    },
    PENALTY: {
      label: 'Penalidad',
      help: 'Importe por incumplir el contrato, como una baja anticipada.',
    },
    MINIMUM_MONTHLY_FEE: {
      label: 'Mínimo mensual',
      help: 'Piso que se cobra aunque la comisión del mes quede por debajo.',
    },
  }),
  [{ enumType: 'atlas_sales.term_type' }],
);

export const billingTimingDomain = defineDomain(
  'crm.billingTiming',
  'Cuándo se factura un término comercial.',
  labelled(Object.values(BillingTiming), {
    PER_TRANSACTION: {
      label: 'Por transacción',
      help: 'Se liquida en cada venta; para comercios con volumen diario.',
    },
    MONTHLY: {
      label: 'Mensual',
      help: 'Se acumula y se cobra una vez al cierre de cada mes.',
    },
    ONE_TIME: {
      label: 'Una sola vez',
      help: 'Se cobra al activar el término y no se repite.',
    },
    ON_DEMAND: {
      label: 'Bajo demanda',
      help: 'Se factura sólo cuando alguien lo solicita expresamente.',
    },
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
    MONTHLY: {
      label: 'Mensual',
      help: 'Doce facturas al año; es el ciclo por defecto de los comercios.',
    },
    QUARTERLY: {
      label: 'Trimestral',
      help: 'Cuatro facturas al año, cada tres meses de servicio.',
    },
    SEMIANNUAL: {
      label: 'Semestral',
      help: 'Dos facturas al año; suele venir con descuento por anticipo.',
    },
    ANNUAL: {
      label: 'Anual',
      help: 'Una factura por gestión, cobrada por adelantado.',
    },
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
    DRAFT: {
      label: 'Borrador',
      help: 'Redactándose todavía; no obliga a ninguna de las dos partes.',
    },
    PENDING_SIGNATURE: {
      label: 'Pendiente de firma',
      help: 'Condiciones cerradas; falta que el comercio lo suscriba.',
    },
    ACTIVE: {
      label: 'Vigente',
      help: 'Firmado y en ejecución: genera comisiones y facturación.',
    },
    EXPIRED: {
      label: 'Vencido',
      help: 'Llegó a su fecha final sin renovarse; deja de facturar.',
    },
    TERMINATED: {
      label: 'Terminado',
      help: 'Se rescindió antes de tiempo; puede implicar penalidad.',
    },
    SUSPENDED: {
      label: 'Suspendido',
      help: 'En pausa por mora o incumplimiento; se puede reanudar.',
    },
  }),
  [{ enumType: 'atlas_sales.contract_status' }],
);

export const merchantInvoiceStatusDomain = defineDomain(
  'crm.merchantInvoiceStatus',
  'Estado de una factura a comercio.',
  labelled(Object.values(InvoiceStatus), {
    DRAFT: {
      label: 'Borrador',
      help: 'Aún editable; el comercio todavía no la recibió.',
    },
    ISSUED: {
      label: 'Emitida',
      help: 'Entregada al comercio y a la espera de su pago.',
    },
    PARTIALLY_PAID: {
      label: 'Pagada en parte',
      help: 'Se recibió un abono; queda saldo por cobrar.',
    },
    PAID: { label: 'Pagada', help: 'Cobrada íntegramente; sin saldo pendiente.' },
    OVERDUE: {
      label: 'Vencida',
      help: 'Pasó la fecha límite sin pagarse; entra en gestión de cobranza.',
    },
    CANCELLED: {
      label: 'Anulada',
      help: 'Se dejó sin efecto; no se reclama ni cuenta como ingreso.',
    },
  }),
  [{ enumType: 'atlas_sales.invoice_status' }],
);

export const receivableStatusDomain = defineDomain(
  'crm.receivableStatus',
  'Estado de una cuenta por cobrar a comercio.',
  labelled(Object.values(ReceivableStatus), {
    PENDING: {
      label: 'Pendiente',
      help: 'Dentro del plazo acordado; todavía no vence.',
    },
    PARTIALLY_PAID: {
      label: 'Pagada en parte',
      help: 'Hubo abonos parciales y queda saldo abierto.',
    },
    PAID: { label: 'Pagada', help: 'El comercio canceló el total de la deuda.' },
    OVERDUE: {
      label: 'Vencida',
      help: 'Superó la fecha de pago; puede devengar recargos.',
    },
    CANCELLED: {
      label: 'Anulada',
      help: 'Se dio de baja la deuda por error o por acuerdo.',
    },
    DISPUTED: {
      label: 'En disputa',
      help: 'El comercio reclama el importe; el cobro queda en suspenso.',
    },
  }),
  [{ enumType: 'atlas_sales.receivable_status' }],
);

export const payableStatusDomain = defineDomain(
  'crm.payableStatus',
  'Estado de un pago programado al comercio.',
  labelled(Object.values(PayableStatus), {
    SCHEDULED: {
      label: 'Programado',
      help: 'Tiene fecha futura de desembolso y aún no vence.',
    },
    DUE: {
      label: 'Por pagar',
      help: 'Llegó su fecha; entra en el próximo lote de tesorería.',
    },
    PAID: { label: 'Pagado', help: 'El dinero ya salió y se acreditó al comercio.' },
    CANCELLED: {
      label: 'Anulado',
      help: 'Se dejó sin efecto antes de desembolsarse.',
    },
    DISPUTED: {
      label: 'En disputa',
      help: 'Hay desacuerdo sobre el importe; se retiene hasta resolverlo.',
    },
  }),
  [{ enumType: 'atlas_sales.payable_status' }],
);

export const recoveryStatusDomain = defineDomain(
  'crm.recoveryStatus',
  'Estado de un recobro al cliente.',
  labelled(Object.values(RecoveryStatus), {
    OPEN: {
      label: 'Abierto',
      help: 'Se detectó el importe a recuperar y nadie lo gestiona aún.',
    },
    IN_COLLECTION: {
      label: 'En cobranza',
      help: 'Cobranza lo está trabajando con gestiones registradas.',
    },
    PARTIALLY_RECOVERED: {
      label: 'Recuperado en parte',
      help: 'Se rescató una porción; el resto sigue en gestión.',
    },
    RECOVERED: {
      label: 'Recuperado',
      help: 'Se cobró la totalidad; el caso se cierra sin pérdida.',
    },
    WRITTEN_OFF: {
      label: 'Castigado',
      help: 'Se da por incobrable y se lleva a pérdida contable.',
    },
  }),
  [{ enumType: 'atlas_sales.recovery_status' }],
);

export const branchStatusDomain = defineDomain(
  'crm.branchStatus',
  'Estado de una sucursal de comercio.',
  labelled(Object.values(BranchStatus), {
    PENDING: {
      label: 'Pendiente',
      help: 'Registrada pero sin habilitar; no puede cobrar todavía.',
    },
    ACTIVE: {
      label: 'Activa',
      help: 'Opera con normalidad y acepta ventas de clientes Atlas.',
    },
    INACTIVE: {
      label: 'Inactiva',
      help: 'Cerrada o sin actividad; deja de aparecer en la app.',
    },
    SUSPENDED: {
      label: 'Suspendida',
      help: 'Bloqueada por una incidencia; se reactiva al resolverla.',
    },
  }),
);

export const merchantUserStatusDomain = defineDomain(
  'crm.merchantUserStatus',
  'Estado de acceso de una persona del comercio.',
  labelled(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const, {
    INVITED: {
      label: 'Invitado',
      help: 'Se le enviaron credenciales y aún no entró al portal.',
    },
    ACTIVE: {
      label: 'Activo',
      help: 'Puede iniciar sesión y operar según su rol.',
    },
    SUSPENDED: {
      label: 'Suspendido',
      help: 'Acceso cortado temporalmente; se restituye sin recrear la cuenta.',
    },
    DISABLED: {
      label: 'Deshabilitado',
      help: 'Ya no trabaja en el comercio; el acceso queda cerrado.',
    },
  }),
  [{ check: 'ck_merchant_users_status' }],
);

export const onboardingCaseStatusDomain = defineDomain(
  'crm.onboardingCaseStatus',
  'Posición de un caso de alta de comercio en la cadena ERP → Motor → Portal → ERP.',
  labelled(ONBOARDING_CASE_STATUSES, {
    OPEN: {
      label: 'Abierto',
      help: 'Recién creado; faltan documentos antes de pedir la verificación.',
    },
    IN_PROGRESS: { label: 'En curso', help: 'Valor heredado; equivale a abierto.' },
    BLOCKED: { label: 'Bloqueado', help: 'Valor heredado; equivale a revisión.' },
    EN_VERIFICACION: {
      label: 'En verificación',
      help: 'El expediente está en el Motor esperando su veredicto de KYB.',
    },
    REVISION_MANUAL: {
      label: 'En revisión manual',
      help: 'El Motor no decidió solo; una persona debe mirar el caso.',
    },
    RECHAZADO: {
      label: 'Rechazado',
      help: 'La verificación falló; el comercio no se afilia.',
    },
    VERIFICADO: {
      label: 'Verificado',
      help: 'El KYB salió aprobado; ya se pueden pedir credenciales.',
    },
    ALTA_PENDIENTE: {
      label: 'Credenciales pedidas',
      help: 'Se solicitó el usuario al portal y se espera su respuesta.',
    },
    LISTO: {
      label: 'Listo para activar',
      help: 'El portal concedió el acceso; falta el último paso del ERP.',
    },
    COMPLETED: {
      label: 'Activado',
      help: 'Único estado que saca el caso de la cola: el comercio ya opera.',
    },
  }),
);

export const onboardingScopeDomain = defineDomain(
  'crm.onboardingScope',
  'Qué casos de alta enseña la cola.',
  labelled(ONBOARDING_SCOPES, {
    abiertos: {
      label: 'Abiertos',
      help: 'Lo que falta por hacer; es la vista por defecto para trabajar.',
    },
    historial: {
      label: 'Historial',
      help: 'Sólo los comercios ya activados, para consultar lo cerrado.',
    },
    todos: {
      label: 'Todos',
      help: 'Vista completa; sirve para exportar y auditar, no para operar.',
    },
  }),
);

export const checklistStatusDomain = defineDomain(
  'crm.checklistStatus',
  'Estado de un requisito del alta de comercio.',
  labelled(Object.values(ChecklistStatus), {
    PENDING: {
      label: 'Pendiente',
      help: 'Todavía no se entregó ni se verificó lo que pide el requisito.',
    },
    COMPLETED: {
      label: 'Cumplido',
      help: 'La evidencia está cargada y alguien la dio por buena.',
    },
    WAIVED: {
      label: 'Dispensado',
      help: 'No se exige para este comercio; queda registrado quién lo dispensó.',
    },
    BLOCKED: {
      label: 'Bloqueado',
      help: 'No se puede avanzar hasta resolver un impedimento externo.',
    },
  }),
);

export const checklistItemTypeDomain = defineDomain(
  'crm.checklistItemType',
  'Área a la que pertenece un requisito del alta de comercio.',
  labelled(['LEGAL', 'OPERATIONS', 'TECHNICAL', 'FINANCE', 'COMPLIANCE'] as const, {
    LEGAL: {
      label: 'Legal',
      help: 'Documentos societarios: NIT, matrícula, poderes del firmante.',
    },
    OPERATIONS: {
      label: 'Operaciones',
      help: 'Puesta en marcha: sucursales, horarios, capacitación del personal.',
    },
    TECHNICAL: {
      label: 'Técnico',
      help: 'Integración y equipos: QR, terminal, acceso al portal.',
    },
    FINANCE: {
      label: 'Finanzas',
      help: 'Datos de cobro: cuenta bancaria, comisiones y garantías.',
    },
    COMPLIANCE: {
      label: 'Cumplimiento',
      help: 'Prevención de lavado: KYB, listas restrictivas, origen de fondos.',
    },
  }),
);

export const activityTypeDomain = defineDomain(
  'crm.activityType',
  'Clase de actividad comercial registrada.',
  labelled(['NOTE', 'CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'VISIT', 'TASK', 'OTHER'] as const, {
    NOTE: {
      label: 'Nota',
      help: 'Apunte interno sin contacto con el cliente.',
    },
    CALL: {
      label: 'Llamada',
      help: 'Conversación telefónica; conviene anotar con quién y el acuerdo.',
    },
    MEETING: {
      label: 'Reunión',
      help: 'Encuentro presencial o por video con el comercio.',
    },
    EMAIL: {
      label: 'Correo',
      help: 'Intercambio escrito que deja constancia de lo ofrecido.',
    },
    WHATSAPP: {
      label: 'WhatsApp',
      help: 'Mensajería con el contacto; el canal más usado con comercios.',
    },
    VISIT: {
      label: 'Visita',
      help: 'Se fue al local del comercio; sirve para verificar la actividad.',
    },
    TASK: {
      label: 'Tarea',
      help: 'Pendiente con responsable y fecha, no un hecho ya ocurrido.',
    },
    OTHER: {
      label: 'Otra',
      help: 'Gestión que no encaja en los canales anteriores.',
    },
  }),
);

export const segmentSubjectDomain = defineDomain(
  'crm.segmentSubject',
  'A quién agrupa un segmento comercial.',
  labelled(SEGMENT_SUBJECTS, {
    CREDIT_APPLICANT: {
      label: 'Clientes solicitantes de crédito',
      help: 'Personas que pidieron financiamiento; se agrupan por su perfil.',
    },
    PARTNER: {
      label: 'Comercios y aliados',
      help: 'Cuentas del CRM; se agrupan por rubro, volumen o territorio.',
    },
  }),
  [{ check: 'ck_crm_segments_subject' }],
);

export const segmentStatusDomain = defineDomain(
  'crm.segmentStatus',
  'Estado de un segmento comercial.',
  labelled(['ACTIVE', 'INACTIVE'] as const, {
    ACTIVE: {
      label: 'Activo',
      help: 'Se evalúa y puede usarse para campañas o reglas comerciales.',
    },
    INACTIVE: {
      label: 'Inactivo',
      help: 'Se deja de evaluar sin borrar su definición ni su historia.',
    },
  }),
  [{ check: 'ck_crm_segments_status' }],
);

export const segmentOperatorDomain = defineDomain(
  'platform.segmentOperator',
  'Cómo compara una regla de segmento.',
  labelled(SEGMENT_OPERATORS, {
    EQUALS: {
      label: 'Es igual a',
      help: 'Coincidencia exacta con un único valor escrito.',
    },
    NOT_EQUALS: {
      label: 'Es distinto de',
      help: 'Excluye a quien tenga exactamente ese valor.',
    },
    IN: { label: 'Está entre', help: 'Varios valores separados por coma.' },
    NOT_IN: { label: 'No está entre', help: 'Varios valores separados por coma.' },
    BETWEEN: { label: 'Entre dos números', help: 'Mínimo y máximo, separados por coma.' },
    EXISTS: {
      label: 'Tiene valor',
      help: 'Basta con que el dato esté cargado, sea cual sea.',
    },
  }),
);

export const segmentMatchDomain = defineDomain(
  'platform.segmentMatch',
  'Cómo se combinan las reglas de un segmento.',
  labelled(['ALL', 'ANY'] as const, {
    ALL: {
      label: 'Cumple todas las reglas',
      help: 'Más restrictivo: cada condición tiene que darse a la vez.',
    },
    ANY: {
      label: 'Cumple al menos una regla',
      help: 'Más amplio: con una sola condición que se dé, ya entra.',
    },
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
    LOW: {
      label: 'Bajo',
      help: 'Historial limpio y actividad estable; no exige controles extra.',
    },
    MEDIUM: {
      label: 'Medio',
      help: 'Señales menores a vigilar; se revisa en el seguimiento habitual.',
    },
    HIGH: {
      label: 'Alto',
      help: 'Exige garantías o límites más estrictos antes de operar.',
    },
    CRITICAL: {
      label: 'Crítico',
      help: 'No se opera sin aprobación expresa de riesgo y cumplimiento.',
    },
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
      RETAIL: {
        label: 'Retail / Comercio',
        help: 'Venta al público de productos variados en local propio.',
      },
      SERVICIOS: {
        label: 'Servicios profesionales',
        help: 'Consultoría, estudios jurídicos, contables y afines.',
      },
      EDUCACION: {
        label: 'Educación',
        help: 'Colegios, institutos, academias y cursos de preparación.',
      },
      SALUD: {
        label: 'Salud y farmacia',
        help: 'Clínicas, consultorios, laboratorios y venta de medicamentos.',
      },
      ALIMENTOS: {
        label: 'Alimentos y bebidas',
        help: 'Restaurantes, cafeterías, abarrotes y supermercados.',
      },
      TECNOLOGIA: {
        label: 'Tecnología y electrónica',
        help: 'Computación, celulares, electrodomésticos y reparación.',
      },
      HOGAR: {
        label: 'Hogar y muebles',
        help: 'Mueblería, decoración, línea blanca y artículos del hogar.',
      },
      VESTIMENTA: {
        label: 'Vestimenta y calzado',
        help: 'Boutiques, zapaterías y venta de ropa en general.',
      },
      AUTOMOTOR: {
        label: 'Automotor y repuestos',
        help: 'Venta de vehículos, talleres, llanteras y autopartes.',
      },
      CONSTRUCCION: {
        label: 'Construcción y ferretería',
        help: 'Materiales, ferreterías y servicios de obra.',
      },
      TURISMO: {
        label: 'Turismo y transporte',
        help: 'Agencias de viaje, hoteles, buses y traslados.',
      },
      OTRO: {
        label: 'Otro',
        help: 'Ningún rubro anterior aplica; conviene revisarlo luego.',
      },
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
      RETAIL: {
        label: 'Retail / Comercio',
        help: 'Vende al consumidor final en tienda o por internet.',
      },
      SERVICES: {
        label: 'Servicios',
        help: 'Su producto es el trabajo de personas, no un bien físico.',
      },
      MANUFACTURING: {
        label: 'Manufactura',
        help: 'Transforma materia prima en productos terminados.',
      },
      TECHNOLOGY: {
        label: 'Tecnología',
        help: 'Software, hardware y servicios informáticos.',
      },
      FINANCE: {
        label: 'Finanzas',
        help: 'Bancos, cooperativas, seguros y casas de cambio.',
      },
      HEALTHCARE: {
        label: 'Salud',
        help: 'Atención médica, seguros de salud y laboratorios.',
      },
      EDUCATION: {
        label: 'Educación',
        help: 'Formación reglada y capacitación de cualquier nivel.',
      },
      LOGISTICS: {
        label: 'Transporte y logística',
        help: 'Mueve carga o personas: flotas, couriers, almacenes.',
      },
      FOOD_BEVERAGE: {
        label: 'Alimentos y bebidas',
        help: 'Produce o vende comida y bebida, incluida la gastronomía.',
      },
      OTHER: {
        label: 'Otro',
        help: 'La actividad no encaja en las industrias listadas.',
      },
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
      ELECTRODOMESTICOS: {
        label: 'Venta de electrodomésticos y tecnología',
        help: 'Línea blanca, celulares y computación; ticket alto y financiable.',
      },
      ABARROTES: {
        label: 'Supermercado y abarrotes',
        help: 'Canasta familiar con compras frecuentes y de monto bajo.',
      },
      FARMACIA: {
        label: 'Farmacia',
        help: 'Medicamentos y cuidado personal; venta recurrente y regulada.',
      },
      RESTAURANTE: {
        label: 'Restaurante y comida rápida',
        help: 'Consumo en el local o para llevar, con alta rotación diaria.',
      },
      PREPARACION_ACADEMICA: {
        label: 'Preparación académica y cursos',
        help: 'Preuniversitarios y capacitaciones cobradas por módulo.',
      },
      INSTITUCION_EDUCATIVA: {
        label: 'Colegio o instituto',
        help: 'Educación reglada con matrícula y pensiones mensuales.',
      },
      ROPA_CALZADO: {
        label: 'Tienda de ropa y calzado',
        help: 'Moda y calzado; la venta sigue la temporada.',
      },
      MUEBLERIA: {
        label: 'Mueblería y decoración',
        help: 'Muebles y equipamiento del hogar; compras grandes y espaciadas.',
      },
      FERRETERIA: {
        label: 'Ferretería y materiales',
        help: 'Herramientas y material de obra para maestros y familias.',
      },
      TALLER_REPUESTOS: {
        label: 'Taller y repuestos',
        help: 'Mantenimiento vehicular y venta de autopartes.',
      },
      VIAJES_TRANSPORTE: {
        label: 'Agencia de viajes y transporte',
        help: 'Pasajes, paquetes turísticos y traslados.',
      },
      SERVICIOS_PROFESIONALES: {
        label: 'Servicios profesionales',
        help: 'Honorarios de estudios, consultorios y oficinas técnicas.',
      },
      OTRO: {
        label: 'Otro',
        help: 'Actividad que no coincide con ninguna de las anteriores.',
      },
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
      PROPIETARIO: {
        label: 'Propietario / Dueño',
        help: 'Es el titular del negocio; en comercios chicos decide todo.',
      },
      GERENTE_GENERAL: {
        label: 'Gerente general',
        help: 'Máxima autoridad ejecutiva de la empresa.',
      },
      GERENTE_COMERCIAL: {
        label: 'Gerente comercial',
        help: 'Responde por las ventas; es el interlocutor natural del ejecutivo.',
      },
      GERENTE_FINANZAS: {
        label: 'Gerente de finanzas',
        help: 'Decide sobre comisiones, cobros y condiciones de pago.',
      },
      GERENTE_OPERACIONES: {
        label: 'Gerente de operaciones',
        help: 'Manda sobre sucursales, personal y puesta en marcha.',
      },
      ADMINISTRADOR: {
        label: 'Administrador',
        help: 'Lleva el día a día administrativo del local.',
      },
      CONTADOR: {
        label: 'Contador',
        help: 'Ve las facturas y los impuestos; útil para temas tributarios.',
      },
      ENCARGADO_SUCURSAL: {
        label: 'Encargado de sucursal',
        help: 'Responde por un punto de venta concreto, no por toda la cuenta.',
      },
      VENDEDOR: {
        label: 'Vendedor / Cajero',
        help: 'Atiende el mostrador; es quien usa el QR en la práctica.',
      },
      OTRO: {
        label: 'Otro',
        help: 'Cargo distinto a los listados; conviene aclararlo en la nota.',
      },
    },
  ),
);

export const decisionRoleDomain = defineDomain(
  'crm.decisionRole',
  'Peso del contacto en la decisión de compra.',
  labelled(['DECISOR', 'INFLUENCIADOR', 'APROBADOR', 'USUARIO', 'GESTOR', 'BLOQUEADOR'] as const, {
    DECISOR: {
      label: 'Decisor final',
      help: 'Su sí cierra el trato; sin él la negociación no avanza.',
    },
    INFLUENCIADOR: {
      label: 'Influenciador',
      help: 'No firma, pero su opinión pesa sobre quien decide.',
    },
    APROBADOR: {
      label: 'Aprobador de presupuesto',
      help: 'Libera el dinero aunque no elija al proveedor.',
    },
    USUARIO: {
      label: 'Usuario del servicio',
      help: 'Lo usará a diario; su comodidad define la renovación.',
    },
    GESTOR: {
      label: 'Contacto de gestión',
      help: 'Coordina papeles y reuniones; es la puerta de entrada operativa.',
    },
    BLOQUEADOR: {
      label: 'Bloqueador / Portero',
      help: 'Puede frenar el trato; hay que neutralizar su objeción.',
    },
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
