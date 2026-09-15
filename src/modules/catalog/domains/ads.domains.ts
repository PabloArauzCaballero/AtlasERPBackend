import { defineDomain, labelled } from '../../../common/catalog/domain';
import {
  advertiserStatuses,
  approvalStatuses,
  auditSeverities,
  billingModes,
  buyingModels,
  campaignObjectives,
  campaignStatuses,
  creativeTypes,
  eventTypes,
  invoiceStatuses,
  ledgerEntryTypes,
  moderationDecisions,
  policyRuleTypes,
  riskStatuses,
} from '../../ads/ads.enums';
import { SEGMENT_PRIVACY_LEVELS, SEGMENT_TYPES } from '../../ads/ads.segmentation';

/** Vocabulario de publicidad. Los CHECK viven en la migración del esquema de Ads. */

export const advertiserStatusDomain = defineDomain(
  'ads.advertiserStatus',
  'Estado de un anunciante.',
  labelled(advertiserStatuses, {
    PENDING_REVIEW: 'Pendiente de revisión',
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    REJECTED: 'Rechazado',
  }),
  [{ check: 'ck_advertiser_status' }],
);

export const advertiserBillingModeDomain = defineDomain(
  'ads.billingMode',
  'Cómo paga un anunciante.',
  labelled(billingModes, {
    PREPAID: { label: 'Prepago', help: 'Carga saldo antes de que se entreguen anuncios.' },
    POSTPAID: { label: 'Pospago', help: 'Se le factura al cierre del período.' },
  }),
  [{ check: 'ck_billing_mode' }],
);

export const advertiserRiskStatusDomain = defineDomain(
  'ads.riskStatus',
  'Situación de riesgo de un anunciante.',
  labelled(riskStatuses, {
    NORMAL: 'Normal',
    WATCHLIST: 'En observación',
    BLOCKED: 'Bloqueado',
  }),
  [{ check: 'ck_risk_status' }],
);

export const campaignStatusDomain = defineDomain(
  'ads.campaignStatus',
  'Estado de una campaña publicitaria.',
  labelled(campaignStatuses, {
    DRAFT: 'Borrador',
    PENDING_REVIEW: 'Pendiente de revisión',
    APPROVED: 'Aprobada',
    ACTIVE: 'Activa',
    PAUSED: 'Pausada',
    ENDED: 'Finalizada',
    REJECTED: 'Rechazada',
    ARCHIVED: 'Archivada',
  }),
  [{ check: 'ck_campaign_status' }],
);

export const campaignApprovalStatusDomain = defineDomain(
  'ads.approvalStatus',
  'Estado de aprobación de una campaña o creatividad.',
  labelled(approvalStatuses, {
    NOT_SUBMITTED: 'Sin enviar',
    PENDING: 'Pendiente',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
    CHANGES_REQUESTED: 'Cambios solicitados',
  }),
  [{ check: 'ck_campaign_approval' }],
);

export const campaignObjectiveDomain = defineDomain(
  'ads.campaignObjective',
  'Qué busca una campaña.',
  labelled(campaignObjectives, {
    AWARENESS: 'Reconocimiento de marca',
    TRAFFIC: 'Tráfico',
    LEADS: 'Contactos',
    CONVERSIONS: 'Conversiones',
    PROMOTION: 'Promoción',
  }),
  [{ check: 'ck_campaign_objective' }],
);

export const buyingModelDomain = defineDomain(
  'ads.buyingModel',
  'Cómo se cobra la entrega de anuncios.',
  labelled(buyingModels, {
    CPM: { label: 'CPM', help: 'Costo por mil impresiones.' },
    CPC: { label: 'CPC', help: 'Costo por clic.' },
    CPA: { label: 'CPA', help: 'Costo por acción o conversión.' },
    FIXED: { label: 'Precio fijo', help: 'Importe cerrado por el período.' },
  }),
  [{ check: 'ck_ad_set_buying' }, { check: 'ck_ad_inventory_billing_model' }],
);

export const creativeTypeDomain = defineDomain(
  'ads.creativeType',
  'Formato de una creatividad.',
  labelled(creativeTypes, {
    IMAGE: 'Imagen',
    VIDEO: 'Video',
    CAROUSEL: 'Carrusel',
    TEXT_CARD: 'Tarjeta de texto',
  }),
  [{ check: 'ck_creative_type' }],
);

export const moderationDecisionDomain = defineDomain(
  'ads.moderationDecision',
  'Resultado de la moderación de un anuncio.',
  labelled(moderationDecisions, {
    PENDING_REVIEW: 'Pendiente de revisión',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
    CHANGES_REQUESTED: 'Cambios solicitados',
    ESCALATED: 'Escalado',
  }),
  [{ check: 'ck_moderation_decision' }],
);

export const adEventTypeDomain = defineDomain(
  'ads.eventType',
  'Evento de entrega registrado.',
  labelled(eventTypes, { IMPRESSION: 'Impresión', CLICK: 'Clic', CONVERSION: 'Conversión' }),
  [{ check: 'ck_ad_event_type' }],
);

export const adInvoiceStatusDomain = defineDomain(
  'ads.invoiceStatus',
  'Estado de una factura de publicidad.',
  labelled(invoiceStatuses, {
    DRAFT: 'Borrador',
    ISSUED: 'Emitida',
    PARTIALLY_PAID: 'Pagada en parte',
    PAID: 'Pagada',
    OVERDUE: 'Vencida',
    VOID: 'Anulada',
  }),
  [{ check: 'ck_invoice_status' }],
);

export const spendLedgerEntryTypeDomain = defineDomain(
  'ads.spendLedgerEntryType',
  'Clase de movimiento del libro de gasto publicitario.',
  labelled(ledgerEntryTypes, {
    CHARGE: 'Cargo',
    CREDIT: 'Abono',
    ADJUSTMENT: 'Ajuste',
    REFUND: 'Devolución',
    TAX: 'Impuesto',
  }),
  [{ check: 'ck_spend_ledger_type' }],
);

export const policyRuleTypeDomain = defineDomain(
  'ads.policyRuleType',
  'Qué hace una política cuando un anuncio la incumple.',
  labelled(policyRuleTypes, {
    AUTO_REJECT: 'Rechazo automático',
    MANUAL_REVIEW_REQUIRED: 'Exige revisión manual',
    WARNING: 'Sólo advertencia',
    BLOCK_DELIVERY: 'Bloquea la entrega',
  }),
  [{ check: 'ck_ad_policy_rule_type' }],
);

export const policySeverityDomain = defineDomain(
  'ads.policySeverity',
  'Gravedad de una política publicitaria.',
  labelled(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const, {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  }),
  [{ check: 'ck_ad_policy_severity' }],
);

export const auditSeverityDomain = defineDomain(
  'ads.auditSeverity',
  'Gravedad de un evento de auditoría de publicidad.',
  labelled(auditSeverities, {
    INFO: 'Informativo',
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  }),
  [{ check: 'ck_ad_audit_severity' }],
);

export const segmentTypeDomain = defineDomain(
  'ads.segmentType',
  'Clase de segmento de audiencia.',
  labelled(SEGMENT_TYPES, {
    CORPORATE_CONTEXTUAL: 'Contextual corporativo',
    MERCHANT_CATEGORY: 'Por rubro del comercio',
    GEO: 'Geográfico',
    CUSTOM_ALLOWLIST: { label: 'Lista propia', help: 'Identificadores hasheados; nunca en claro.' },
    LOOKUP_STATIC: 'Búsqueda estática',
  }),
  [{ check: 'ck_segment_type' }],
);

export const segmentPrivacyLevelDomain = defineDomain(
  'ads.segmentPrivacyLevel',
  'Nivel de privacidad de un segmento de audiencia.',
  labelled(SEGMENT_PRIVACY_LEVELS, {
    CORPORATE_CONTEXTUAL: 'Contextual corporativo',
    AGGREGATED: 'Agregado',
    HASHED_ALLOWLIST: 'Lista hasheada',
  }),
  [{ check: 'ck_privacy_level' }],
);

export const deliveryBillableStatusDomain = defineDomain(
  'ads.deliveryBillableStatus',
  'Si una entrega se factura.',
  labelled(['BILLABLE', 'NON_BILLABLE', 'SUSPICIOUS'] as const, {
    BILLABLE: 'Facturable',
    NON_BILLABLE: 'No facturable',
    SUSPICIOUS: {
      label: 'Sospechosa',
      help: 'Posible tráfico inválido; no se cobra hasta revisarla.',
    },
  }),
);

export const emailSuppressionReasonDomain = defineDomain(
  'ads.emailSuppressionReason',
  'Por qué una dirección deja de recibir correos.',
  labelled(['UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_REPORT', 'MANUAL'] as const, {
    UNSUBSCRIBE: 'Se dio de baja',
    HARD_BOUNCE: 'Rebote permanente',
    SPAM_REPORT: 'Lo marcó como spam',
    MANUAL: 'Exclusión manual',
  }),
);

export const performanceGroupingDomain = defineDomain(
  'ads.performanceGrouping',
  'Cómo se agrupa el rendimiento de una campaña.',
  labelled(['CAMPAIGN', 'AD_SET', 'AD', 'DAY'] as const, {
    CAMPAIGN: 'Por campaña',
    AD_SET: 'Por conjunto de anuncios',
    AD: 'Por anuncio',
    DAY: 'Por día',
  }),
);

/*
 * Superficie, formato de espacio y categoría de política eran texto libre. Medido en dev el
 * 2026-09-15: espacios en MERCHANT_PORTAL con formatos IMAGE_BANNER y TEXT_CARD; políticas en
 * PRIVACY y FINANCIAL_CLAIMS. Las listas incluyen esos valores y los que el propio código
 * reconoce (`supportsVideo` se enciende por VIDEO).
 */
export const adSurfaceDomain = defineDomain(
  'ads.surface',
  'Dónde se muestra un espacio publicitario.',
  labelled(['MERCHANT_PORTAL', 'CONSUMER_APP', 'EMAIL'] as const, {
    MERCHANT_PORTAL: 'Portal del comercio',
    CONSUMER_APP: 'App del cliente',
    EMAIL: 'Correo',
  }),
);

export const placementFormatDomain = defineDomain(
  'ads.placementFormat',
  'Formato que admite un espacio publicitario.',
  labelled(['IMAGE_BANNER', 'TEXT_CARD', 'VIDEO', 'CAROUSEL'] as const, {
    IMAGE_BANNER: 'Banner de imagen',
    TEXT_CARD: 'Tarjeta de texto',
    VIDEO: 'Video',
    CAROUSEL: 'Carrusel',
  }),
);

export const policyCategoryDomain = defineDomain(
  'ads.policyCategory',
  'Materia que regula una política publicitaria.',
  labelled(
    [
      'FINANCIAL_CLAIMS',
      'PRIVACY',
      'PROHIBITED_PRODUCTS',
      'MISLEADING_CONTENT',
      'SENSITIVE_CONTENT',
      'INTELLECTUAL_PROPERTY',
      'OTHER',
    ] as const,
    {
      FINANCIAL_CLAIMS: 'Promesas financieras',
      PRIVACY: 'Privacidad',
      PROHIBITED_PRODUCTS: 'Productos prohibidos',
      MISLEADING_CONTENT: 'Contenido engañoso',
      SENSITIVE_CONTENT: 'Contenido sensible',
      INTELLECTUAL_PROPERTY: 'Propiedad intelectual',
      OTHER: 'Otra',
    },
  ),
);

/*
 * Régimen tributario ante el Servicio de Impuestos Nacionales (SIN). El código conserva la forma
 * con la que ya estaba guardado en dev («REGIMEN GENERAL», tres perfiles): cambiarlo a otra
 * escritura habría dejado esas filas fuera del select.
 */
export const taxRegimeDomain = defineDomain(
  'ads.taxRegime',
  'Régimen tributario del anunciante ante el SIN.',
  labelled(
    [
      'REGIMEN GENERAL',
      'REGIMEN SIMPLIFICADO',
      'SISTEMA TRIBUTARIO INTEGRADO',
      'REGIMEN AGROPECUARIO UNIFICADO',
    ] as const,
    {
      'REGIMEN GENERAL': 'Régimen General',
      'REGIMEN SIMPLIFICADO': 'Régimen Tributario Simplificado (RTS)',
      'SISTEMA TRIBUTARIO INTEGRADO': 'Sistema Tributario Integrado (STI)',
      'REGIMEN AGROPECUARIO UNIFICADO': 'Régimen Agropecuario Unificado (RAU)',
    },
  ),
);

export const ADS_DOMAINS = [
  advertiserStatusDomain,
  advertiserBillingModeDomain,
  advertiserRiskStatusDomain,
  campaignStatusDomain,
  campaignApprovalStatusDomain,
  campaignObjectiveDomain,
  buyingModelDomain,
  creativeTypeDomain,
  moderationDecisionDomain,
  adEventTypeDomain,
  adInvoiceStatusDomain,
  spendLedgerEntryTypeDomain,
  policyRuleTypeDomain,
  policySeverityDomain,
  auditSeverityDomain,
  segmentTypeDomain,
  segmentPrivacyLevelDomain,
  deliveryBillableStatusDomain,
  emailSuppressionReasonDomain,
  performanceGroupingDomain,
  adSurfaceDomain,
  placementFormatDomain,
  policyCategoryDomain,
  taxRegimeDomain,
] as const;
