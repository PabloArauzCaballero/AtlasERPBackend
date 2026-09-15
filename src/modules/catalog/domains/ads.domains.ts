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
    PENDING_REVIEW: {
      label: 'Pendiente de revisión',
      help: 'Se registró pero nadie validó sus datos; no puede entregar anuncios.',
    },
    ACTIVE: {
      label: 'Activo',
      help: 'Habilitado para crear campañas y consumir presupuesto.',
    },
    SUSPENDED: {
      label: 'Suspendido',
      help: 'Se le cortó la entrega por mora o incumplimiento; es reversible.',
    },
    REJECTED: {
      label: 'Rechazado',
      help: 'No pasó la revisión de alta; no llega a operar.',
    },
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
    NORMAL: {
      label: 'Normal',
      help: 'Sin alertas: opera con los límites ordinarios.',
    },
    WATCHLIST: {
      label: 'En observación',
      help: 'Hay señales que vigilar; sigue entregando pero se le revisa.',
    },
    BLOCKED: {
      label: 'Bloqueado',
      help: 'Riesgo confirmado: se detiene la entrega y el gasto.',
    },
  }),
  [{ check: 'ck_risk_status' }],
);

export const campaignStatusDomain = defineDomain(
  'ads.campaignStatus',
  'Estado de una campaña publicitaria.',
  labelled(campaignStatuses, {
    DRAFT: {
      label: 'Borrador',
      help: 'En preparación; no consume presupuesto ni se muestra.',
    },
    PENDING_REVIEW: {
      label: 'Pendiente de revisión',
      help: 'Enviada a moderación y a la espera de veredicto.',
    },
    APPROVED: {
      label: 'Aprobada',
      help: 'Pasó moderación; entregará cuando llegue su fecha de inicio.',
    },
    ACTIVE: {
      label: 'Activa',
      help: 'Entregando ahora mismo y descontando del presupuesto.',
    },
    PAUSED: {
      label: 'Pausada',
      help: 'Se detuvo la entrega a voluntad; se reanuda sin volver a aprobarla.',
    },
    ENDED: {
      label: 'Finalizada',
      help: 'Llegó a su fecha final o agotó el presupuesto.',
    },
    REJECTED: {
      label: 'Rechazada',
      help: 'Moderación la negó; hay que corregirla y reenviarla.',
    },
    ARCHIVED: {
      label: 'Archivada',
      help: 'Retirada de las listas de trabajo; sólo queda para consulta.',
    },
  }),
  [{ check: 'ck_campaign_status' }],
);

export const campaignApprovalStatusDomain = defineDomain(
  'ads.approvalStatus',
  'Estado de aprobación de una campaña o creatividad.',
  labelled(approvalStatuses, {
    NOT_SUBMITTED: {
      label: 'Sin enviar',
      help: 'Todavía no se pidió revisión; nadie la está mirando.',
    },
    PENDING: {
      label: 'Pendiente',
      help: 'En la cola de moderación esperando que la tomen.',
    },
    APPROVED: {
      label: 'Aprobada',
      help: 'Cumple las políticas y ya puede salir al aire.',
    },
    REJECTED: {
      label: 'Rechazada',
      help: 'Incumple una política; no puede entregarse tal como está.',
    },
    CHANGES_REQUESTED: {
      label: 'Cambios solicitados',
      help: 'Se puede aprobar si el anunciante corrige lo observado.',
    },
  }),
  [{ check: 'ck_campaign_approval' }],
);

export const campaignObjectiveDomain = defineDomain(
  'ads.campaignObjective',
  'Qué busca una campaña.',
  labelled(campaignObjectives, {
    AWARENESS: {
      label: 'Reconocimiento de marca',
      help: 'Que el público recuerde la marca; se mide por alcance, no por clics.',
    },
    TRAFFIC: {
      label: 'Tráfico',
      help: 'Llevar gente a una página o a la ficha del comercio.',
    },
    LEADS: {
      label: 'Contactos',
      help: 'Conseguir datos de personas interesadas para contactarlas.',
    },
    CONVERSIONS: {
      label: 'Conversiones',
      help: 'Que ocurra una acción concreta: compra, alta o solicitud.',
    },
    PROMOTION: {
      label: 'Promoción',
      help: 'Difundir una oferta puntual con fecha de caducidad.',
    },
  }),
  [{ check: 'ck_campaign_objective' }],
);

export const buyingModelDomain = defineDomain(
  'ads.buyingModel',
  'Cómo se cobra la entrega de anuncios.',
  labelled(buyingModels, {
    CPM: { label: 'CPM', help: 'Costo por cada mil impresiones entregadas.' },
    CPC: { label: 'CPC', help: 'Costo por cada clic recibido.' },
    CPA: { label: 'CPA', help: 'Costo por acción o conversión conseguida.' },
    FIXED: { label: 'Precio fijo', help: 'Importe cerrado por el período.' },
  }),
  [{ check: 'ck_ad_set_buying' }, { check: 'ck_ad_inventory_billing_model' }],
);

export const creativeTypeDomain = defineDomain(
  'ads.creativeType',
  'Formato de una creatividad.',
  labelled(creativeTypes, {
    IMAGE: {
      label: 'Imagen',
      help: 'Una sola pieza gráfica estática; es el formato más compatible.',
    },
    VIDEO: {
      label: 'Video',
      help: 'Pieza en movimiento; sólo en espacios que declaran admitirlo.',
    },
    CAROUSEL: {
      label: 'Carrusel',
      help: 'Varias piezas que el usuario desliza en un mismo espacio.',
    },
    TEXT_CARD: {
      label: 'Tarjeta de texto',
      help: 'Título y texto sin imagen; pesa poco y se lee en pantallas chicas.',
    },
  }),
  [{ check: 'ck_creative_type' }],
);

export const moderationDecisionDomain = defineDomain(
  'ads.moderationDecision',
  'Resultado de la moderación de un anuncio.',
  labelled(moderationDecisions, {
    PENDING_REVIEW: {
      label: 'Pendiente de revisión',
      help: 'Aún sin veredicto; el anuncio no sale mientras tanto.',
    },
    APPROVED: {
      label: 'Aprobado',
      help: 'Quien revisó no halló incumplimiento; puede entregarse.',
    },
    REJECTED: {
      label: 'Rechazado',
      help: 'Se halló una infracción; exige registrar qué política se incumplió.',
    },
    CHANGES_REQUESTED: {
      label: 'Cambios solicitados',
      help: 'Se devuelve al anunciante con observaciones concretas que corregir.',
    },
    ESCALATED: {
      label: 'Escalado',
      help: 'El caso es dudoso y pasa a un revisor con más facultades.',
    },
  }),
  [{ check: 'ck_moderation_decision' }],
);

export const adEventTypeDomain = defineDomain(
  'ads.eventType',
  'Evento de entrega registrado.',
  labelled(eventTypes, {
    IMPRESSION: {
      label: 'Impresión',
      help: 'El anuncio se mostró en pantalla, aunque nadie lo tocara.',
    },
    CLICK: {
      label: 'Clic',
      help: 'Alguien pulsó el anuncio y fue al destino.',
    },
    CONVERSION: {
      label: 'Conversión',
      help: 'Tras el clic ocurrió la acción que la campaña perseguía.',
    },
  }),
  [{ check: 'ck_ad_event_type' }],
);

export const adInvoiceStatusDomain = defineDomain(
  'ads.invoiceStatus',
  'Estado de una factura de publicidad.',
  labelled(invoiceStatuses, {
    DRAFT: {
      label: 'Borrador',
      help: 'Aún editable; el anunciante todavía no la recibió.',
    },
    ISSUED: {
      label: 'Emitida',
      help: 'Entregada al anunciante y a la espera de su pago.',
    },
    PARTIALLY_PAID: {
      label: 'Pagada en parte',
      help: 'Se recibió un abono y queda saldo abierto.',
    },
    PAID: { label: 'Pagada', help: 'Cobrada por completo; sin saldo pendiente.' },
    OVERDUE: {
      label: 'Vencida',
      help: 'Superó el plazo de pago; puede frenar la entrega de campañas.',
    },
    VOID: {
      label: 'Anulada',
      help: 'Se dejó sin efecto y no se reclama su cobro.',
    },
  }),
  [{ check: 'ck_invoice_status' }],
);

export const spendLedgerEntryTypeDomain = defineDomain(
  'ads.spendLedgerEntryType',
  'Clase de movimiento del libro de gasto publicitario.',
  labelled(ledgerEntryTypes, {
    CHARGE: {
      label: 'Cargo',
      help: 'Consumo de la entrega: reduce el saldo del anunciante.',
    },
    CREDIT: {
      label: 'Abono',
      help: 'Recarga o bonificación que aumenta el saldo disponible.',
    },
    ADJUSTMENT: {
      label: 'Ajuste',
      help: 'Corrección manual de un importe mal registrado.',
    },
    REFUND: {
      label: 'Devolución',
      help: 'Dinero que se regresa al anunciante, por ejemplo por tráfico inválido.',
    },
    TAX: {
      label: 'Impuesto',
      help: 'Componente tributario del movimiento, separado del consumo.',
    },
  }),
  [{ check: 'ck_spend_ledger_type' }],
);

export const policyRuleTypeDomain = defineDomain(
  'ads.policyRuleType',
  'Qué hace una política cuando un anuncio la incumple.',
  labelled(policyRuleTypes, {
    AUTO_REJECT: {
      label: 'Rechazo automático',
      help: 'El sistema lo niega solo, sin pasar por una persona.',
    },
    MANUAL_REVIEW_REQUIRED: {
      label: 'Exige revisión manual',
      help: 'Manda el anuncio a la cola para que alguien decida.',
    },
    WARNING: {
      label: 'Sólo advertencia',
      help: 'Deja pasar el anuncio pero deja constancia del aviso.',
    },
    BLOCK_DELIVERY: {
      label: 'Bloquea la entrega',
      help: 'El anuncio queda aprobado pero no se muestra.',
    },
  }),
  [{ check: 'ck_ad_policy_rule_type' }],
);

export const policySeverityDomain = defineDomain(
  'ads.policySeverity',
  'Gravedad de una política publicitaria.',
  labelled(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const, {
    LOW: {
      label: 'Baja',
      help: 'Incumplimiento menor de forma; no pone en riesgo a nadie.',
    },
    MEDIUM: {
      label: 'Media',
      help: 'Puede confundir al público; conviene corregirlo antes de salir.',
    },
    HIGH: {
      label: 'Alta',
      help: 'Riesgo reputacional o legal claro; no debería entregarse.',
    },
    CRITICAL: {
      label: 'Crítica',
      help: 'Ilegal o dañino: se corta la entrega de inmediato.',
    },
  }),
  [{ check: 'ck_ad_policy_severity' }],
);

export const auditSeverityDomain = defineDomain(
  'ads.auditSeverity',
  'Gravedad de un evento de auditoría de publicidad.',
  labelled(auditSeverities, {
    INFO: {
      label: 'Informativo',
      help: 'Deja rastro de algo normal; no pide ninguna acción.',
    },
    LOW: {
      label: 'Baja',
      help: 'Anomalía menor: se revisa cuando haya tiempo.',
    },
    MEDIUM: {
      label: 'Media',
      help: 'Merece mirarse dentro de la jornada.',
    },
    HIGH: {
      label: 'Alta',
      help: 'Afecta dinero o entrega; se atiende cuanto antes.',
    },
    CRITICAL: {
      label: 'Crítica',
      help: 'Exige intervención inmediata y aviso a los responsables.',
    },
  }),
  [{ check: 'ck_ad_audit_severity' }],
);

export const segmentTypeDomain = defineDomain(
  'ads.segmentType',
  'Clase de segmento de audiencia.',
  labelled(SEGMENT_TYPES, {
    CORPORATE_CONTEXTUAL: {
      label: 'Contextual corporativo',
      help: 'Mira rubro, riesgo, volumen y antigüedad del comercio, nunca a la persona.',
    },
    MERCHANT_CATEGORY: {
      label: 'Por rubro del comercio',
      help: 'Se define con una sola condición: la categoría del negocio.',
    },
    GEO: {
      label: 'Geográfico',
      help: 'Filtra por ciudad, región o país y por nada más.',
    },
    CUSTOM_ALLOWLIST: { label: 'Lista propia', help: 'Identificadores hasheados; nunca en claro.' },
    LOOKUP_STATIC: {
      label: 'Búsqueda estática',
      help: 'Combina rubro, geografía y superficie en una lista fija que no cambia sola.',
    },
  }),
  [{ check: 'ck_segment_type' }],
);

export const segmentPrivacyLevelDomain = defineDomain(
  'ads.segmentPrivacyLevel',
  'Nivel de privacidad de un segmento de audiencia.',
  labelled(SEGMENT_PRIVACY_LEVELS, {
    CORPORATE_CONTEXTUAL: {
      label: 'Contextual corporativo',
      help: 'El menos invasivo: sólo datos del negocio, ninguno de personas.',
    },
    AGGREGATED: {
      label: 'Agregado',
      help: 'Usa bandas y promedios; no se puede llegar a un individuo.',
    },
    HASHED_ALLOWLIST: {
      label: 'Lista hasheada',
      help: 'El más estricto: apunta a clientes concretos, aunque sea por su huella.',
    },
  }),
  [{ check: 'ck_privacy_level' }],
);

export const deliveryBillableStatusDomain = defineDomain(
  'ads.deliveryBillableStatus',
  'Si una entrega se factura.',
  labelled(['BILLABLE', 'NON_BILLABLE', 'SUSPICIOUS'] as const, {
    BILLABLE: {
      label: 'Facturable',
      help: 'Entrega válida: se cobra al anunciante con normalidad.',
    },
    NON_BILLABLE: {
      label: 'No facturable',
      help: 'Ocurrió pero no se cobra: pruebas, cortesías o entregas internas.',
    },
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
    UNSUBSCRIBE: {
      label: 'Se dio de baja',
      help: 'La persona pidió no recibir más; volver a escribirle es ilegal.',
    },
    HARD_BOUNCE: {
      label: 'Rebote permanente',
      help: 'La casilla no existe; insistir daña la reputación de envío.',
    },
    SPAM_REPORT: {
      label: 'Lo marcó como spam',
      help: 'Denunció el correo; seguir enviando bloquea el dominio entero.',
    },
    MANUAL: {
      label: 'Exclusión manual',
      help: 'Alguien de Atlas la excluyó a mano; conviene anotar el motivo.',
    },
  }),
);

export const performanceGroupingDomain = defineDomain(
  'ads.performanceGrouping',
  'Cómo se agrupa el rendimiento de una campaña.',
  labelled(['CAMPAIGN', 'AD_SET', 'AD', 'DAY'] as const, {
    CAMPAIGN: {
      label: 'Por campaña',
      help: 'Una fila por campaña: la vista más gruesa del resultado.',
    },
    AD_SET: {
      label: 'Por conjunto de anuncios',
      help: 'Separa por segmentación y puja para comparar audiencias.',
    },
    AD: {
      label: 'Por anuncio',
      help: 'Baja a cada pieza; sirve para ver qué creatividad rinde.',
    },
    DAY: {
      label: 'Por día',
      help: 'Serie diaria: muestra la evolución en el tiempo.',
    },
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
    MERCHANT_PORTAL: {
      label: 'Portal del comercio',
      help: 'Lo ven los dueños y operadores de comercios afiliados.',
    },
    CONSUMER_APP: {
      label: 'App del cliente',
      help: 'Lo ven las personas que compran con Atlas desde su teléfono.',
    },
    EMAIL: {
      label: 'Correo',
      help: 'Va dentro de un envío; respeta la lista de supresión.',
    },
  }),
);

export const placementFormatDomain = defineDomain(
  'ads.placementFormat',
  'Formato que admite un espacio publicitario.',
  labelled(['IMAGE_BANNER', 'TEXT_CARD', 'VIDEO', 'CAROUSEL'] as const, {
    IMAGE_BANNER: {
      label: 'Banner de imagen',
      help: 'Franja gráfica de medidas fijas; el formato más habitual.',
    },
    TEXT_CARD: {
      label: 'Tarjeta de texto',
      help: 'Sólo título y cuerpo; útil donde la imagen no carga bien.',
    },
    VIDEO: {
      label: 'Video',
      help: 'Sólo en espacios que declaran soportar reproducción.',
    },
    CAROUSEL: {
      label: 'Carrusel',
      help: 'Varias piezas deslizables en un mismo hueco.',
    },
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
      FINANCIAL_CLAIMS: {
        label: 'Promesas financieras',
        help: 'Tasas, cuotas y rendimientos que se anuncian sin respaldo.',
      },
      PRIVACY: {
        label: 'Privacidad',
        help: 'Uso de datos personales sin consentimiento o fuera de lo declarado.',
      },
      PROHIBITED_PRODUCTS: {
        label: 'Productos prohibidos',
        help: 'Bienes que no se pueden anunciar: armas, drogas y afines.',
      },
      MISLEADING_CONTENT: {
        label: 'Contenido engañoso',
        help: 'Afirmaciones falsas o que inducen a error sobre la oferta.',
      },
      SENSITIVE_CONTENT: {
        label: 'Contenido sensible',
        help: 'Violencia, sexo o temas delicados para el público general.',
      },
      INTELLECTUAL_PROPERTY: {
        label: 'Propiedad intelectual',
        help: 'Uso de marcas, obras o imágenes ajenas sin autorización.',
      },
      OTHER: {
        label: 'Otra',
        help: 'Materia no prevista; exige detallarla en la descripción.',
      },
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
      'REGIMEN GENERAL': {
        label: 'Régimen General',
        help: 'Lleva contabilidad y emite factura; declara IVA, IT e IUE.',
      },
      'REGIMEN SIMPLIFICADO': {
        label: 'Régimen Tributario Simplificado (RTS)',
        help: 'Pequeños comerciantes y artesanos: pagan una cuota fija y no facturan.',
      },
      'SISTEMA TRIBUTARIO INTEGRADO': {
        label: 'Sistema Tributario Integrado (STI)',
        help: 'Transporte público urbano e interprovincial con vehículos propios.',
      },
      'REGIMEN AGROPECUARIO UNIFICADO': {
        label: 'Régimen Agropecuario Unificado (RAU)',
        help: 'Actividad agrícola y pecuaria; tributa por hectárea, no por venta.',
      },
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
