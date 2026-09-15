import { defineDomain, labelled } from '../../../common/catalog/domain';
import {
  PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES,
  PORTAL_MERCHANT_ROLES,
} from '../../portal/portal.constants';

/** Vocabulario del portal del comercio, de archivos, de usuarios internos y de auditoría. */

export const planTierDomain = defineDomain(
  'portal.planTier',
  'Nivel de un plan comercial.',
  labelled(['STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE'] as const, {
    STARTER: {
      label: 'Inicial',
      help: 'El más barato y acotado; para un comercio que recién prueba Atlas.',
    },
    STANDARD: {
      label: 'Estándar',
      help: 'El plan de referencia: cubre a la mayoría de los comercios.',
    },
    PREMIUM: {
      label: 'Premium',
      help: 'Más alcance y prioridad; para comercios con varias sucursales.',
    },
    ENTERPRISE: {
      label: 'Empresarial',
      help: 'Condiciones negociadas caso por caso para cadenas grandes.',
    },
  }),
  [{ check: 'ck_merchant_plans_tier' }],
);

export const planStatusDomain = defineDomain(
  'portal.planStatus',
  'Estado de un plan comercial.',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: {
      label: 'Activo',
      help: 'Se puede contratar y aparece en el catálogo del portal.',
    },
    INACTIVE: { label: 'Inactivo', help: 'No se ofrece a comercios nuevos.' },
    ARCHIVED: {
      label: 'Archivado',
      help: 'Fuera de uso; se conserva por los contratos que aún lo citan.',
    },
  }),
  [{ check: 'ck_merchant_plans_status' }],
);

export const portalCampaignToggleDomain = defineDomain(
  'portal.campaignToggle',
  'Estados de campaña que el comercio puede alternar desde el portal.',
  labelled(PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES, {
    ACTIVE: {
      label: 'Activa',
      help: 'Reanuda la entrega; el presupuesto vuelve a consumirse.',
    },
    PAUSED: {
      label: 'Pausada',
      help: 'Detiene la entrega sin perder lo configurado ni la aprobación.',
    },
  }),
);

export const activeInactiveDomain = defineDomain(
  'platform.activeInactive',
  'Estado simple de un registro que sólo se enciende o se apaga.',
  labelled(['ACTIVE', 'INACTIVE'] as const, {
    ACTIVE: { label: 'Activo', help: 'En funcionamiento y disponible para usarse.' },
    INACTIVE: { label: 'Inactivo', help: 'Apagado, pero se conserva para volver a encenderlo.' },
  }),
);

/*
 * Siglas de la Autoridad de Supervisión del Sistema Financiero (ASFI) de las entidades con las que
 * un comercio suele cobrar por QR. El QR bancario viaja a AtlasBackend, que valida el FORMATO de la
 * sigla (`^[A-Z0-9]{2,16}$`); esta lista es la que evita que el comercio la teclee de memoria. Una
 * entidad que no esté se elige como `OTRA` y la revisión del QR la resuelve.
 *
 * La ayuda de cada banco dice la sigla ASFI —que es lo que se guarda— y cuándo elegirlo, porque el
 * nombre comercial y la sigla no siempre se parecen (BCR es el BCP; BSO es BancoSol).
 */
export const bankInstitutionDomain = defineDomain(
  'portal.bankInstitution',
  'Entidad financiera de un QR bancario, por su sigla ASFI.',
  labelled(
    [
      'BNB',
      'BME',
      'BUN',
      'BCR',
      'BIS',
      'BGA',
      'BEC',
      'BSO',
      'BIE',
      'BPR',
      'BFO',
      'BDP',
      'OTRA',
    ] as const,
    {
      BNB: {
        label: 'Banco Nacional de Bolivia',
        help: 'Sigla ASFI BNB; elige si el QR lo emitió este banco.',
      },
      BME: {
        label: 'Banco Mercantil Santa Cruz',
        help: 'Sigla ASFI BME; el QR suele decir «Mercantil Santa Cruz».',
      },
      BUN: {
        label: 'Banco Unión',
        help: 'Sigla ASFI BUN; es el banco estatal con el que cobra mucho comercio.',
      },
      BCR: {
        label: 'Banco de Crédito de Bolivia (BCP)',
        help: 'Sigla ASFI BCR aunque la marca visible sea BCP.',
      },
      BIS: {
        label: 'Banco BISA',
        help: 'Sigla ASFI BIS; elige si el QR lleva la marca BISA.',
      },
      BGA: {
        label: 'Banco Ganadero',
        help: 'Sigla ASFI BGA; fuerte en el oriente del país.',
      },
      BEC: {
        label: 'Banco Económico',
        help: 'Sigla ASFI BEC; elige si el QR dice «Banco Económico».',
      },
      BSO: {
        label: 'Banco Solidario (BancoSol)',
        help: 'Sigla ASFI BSO; banca para microempresa, la marca dice BancoSol.',
      },
      BIE: {
        label: 'Banco FIE',
        help: 'Sigla ASFI BIE, no FIE; es la que espera el validador.',
      },
      BPR: {
        label: 'Banco Prodem',
        help: 'Sigla ASFI BPR; común en comercios de área rural y periurbana.',
      },
      BFO: {
        label: 'Banco Fortaleza',
        help: 'Sigla ASFI BFO; elige si el QR lleva la marca Fortaleza.',
      },
      BDP: {
        label: 'Banco de Desarrollo Productivo',
        help: 'Sigla ASFI BDP; banca de segundo piso, poco habitual en un QR.',
      },
      OTRA: { label: 'Otra entidad', help: 'La confirma quien revisa el QR.' },
    },
  ),
);

export const merchantUserRoleDomain = defineDomain(
  'portal.merchantUserRole',
  'Rol de una persona del comercio en el portal.',
  labelled(
    [...PORTAL_MERCHANT_ROLES, 'BRANCH_MANAGER', 'MERCHANT_OPERATOR', 'FINANCIAL_AUDITOR'] as const,
    {
      MERCHANT_ADMIN: { label: 'Administrador del comercio', help: 'Gestiona todo el comercio.' },
      BRANCH_MANAGER: {
        label: 'Gerente de sucursal',
        help: 'Manda sobre un solo local: su equipo, sus ventas y sus cobros.',
      },
      MERCHANT_OPERATOR: {
        label: 'Operador',
        help: 'Atiende el mostrador: cobra con QR y consulta sus propias ventas.',
      },
      FINANCIAL_AUDITOR: {
        label: 'Auditor financiero',
        help: 'Sólo lectura de liquidaciones y facturas; no puede operar nada.',
      },
    },
  ),
);

export const fileOwnerTypeDomain = defineDomain(
  'files.ownerType',
  'A qué registro pertenece un archivo adjunto.',
  labelled(
    [
      'GL_ACCOUNT',
      'BUSINESS_PARTNER',
      'ACCOUNTING_DOCUMENT',
      'JOURNAL_ENTRY',
      'CONTRACT',
      'B2B_ACCOUNT',
      'OPPORTUNITY',
      'MERCHANT',
      'LEGAL_ENTITY',
      'OTHER',
    ] as const,
    {
      GL_ACCOUNT: {
        label: 'Cuenta contable',
        help: 'Respaldo de la cuenta en sí: su apertura o su reclasificación.',
      },
      BUSINESS_PARTNER: {
        label: 'Business partner',
        help: 'Papeles del tercero: NIT, poderes, datos bancarios.',
      },
      ACCOUNTING_DOCUMENT: {
        label: 'Documento contable',
        help: 'Comprobante escaneado que respalda el documento completo.',
      },
      JOURNAL_ENTRY: {
        label: 'Asiento',
        help: 'Respaldo de una línea concreta del asiento, no de todo el documento.',
      },
      CONTRACT: {
        label: 'Contrato',
        help: 'El contrato firmado y sus anexos o adendas.',
      },
      B2B_ACCOUNT: {
        label: 'Cuenta comercial',
        help: 'Documentación de la cuenta del CRM: fichas y evaluaciones.',
      },
      OPPORTUNITY: {
        label: 'Oportunidad',
        help: 'Material de la negociación: propuestas, cotizaciones, actas.',
      },
      MERCHANT: {
        label: 'Comercio',
        help: 'Evidencia del alta del comercio: fotos del local, licencias.',
      },
      LEGAL_ENTITY: {
        label: 'Entidad legal',
        help: 'Documentos societarios de una empresa del grupo Atlas.',
      },
      OTHER: {
        label: 'Otro',
        help: 'No pertenece a ninguno de los registros anteriores.',
      },
    },
  ),
);

export const evidenceContentTypeDomain = defineDomain(
  'files.contentType',
  'Tipos de archivo que admite el almacén de evidencia.',
  labelled(['application/pdf', 'image/jpeg', 'image/png'] as const, {
    'application/pdf': {
      label: 'PDF',
      help: 'Lo preferible para contratos y facturas: conserva varias páginas.',
    },
    'image/jpeg': {
      label: 'Imagen JPEG',
      help: 'Fotos tomadas con el teléfono; pesa poco pero pierde detalle.',
    },
    'image/png': {
      label: 'Imagen PNG',
      help: 'Capturas de pantalla y QR: no pierde nitidez al comprimirse.',
    },
  }),
);

export const internalDepartmentDomain = defineDomain(
  'auth.internalDepartment',
  'Área de la empresa a la que pertenece un usuario interno.',
  labelled(
    [
      'OPERATIONS',
      'RISK',
      'COLLECTIONS',
      'COMPLIANCE',
      'FINANCE',
      'SUPPORT',
      'SYSTEMS',
      'AUDIT',
      'EXECUTIVE',
    ] as const,
    {
      OPERATIONS: {
        label: 'Operaciones',
        help: 'Lleva el día a día: altas de comercios y atención del circuito.',
      },
      RISK: {
        label: 'Riesgo',
        help: 'Decide límites y políticas de crédito antes de prestar.',
      },
      COLLECTIONS: {
        label: 'Cobranza',
        help: 'Recupera la cartera vencida y gestiona los acuerdos de pago.',
      },
      COMPLIANCE: {
        label: 'Cumplimiento',
        help: 'KYB, listas restrictivas y prevención de lavado de dinero.',
      },
      FINANCE: {
        label: 'Finanzas',
        help: 'Contabilidad, tesorería, impuestos y reportes a la dirección.',
      },
      SUPPORT: {
        label: 'Soporte',
        help: 'Atiende a clientes y comercios y resuelve incidencias.',
      },
      SYSTEMS: {
        label: 'Sistemas',
        help: 'Mantiene la plataforma; suele tener accesos técnicos amplios.',
      },
      AUDIT: {
        label: 'Auditoría',
        help: 'Revisa a las demás áreas; en general sólo lectura.',
      },
      EXECUTIVE: {
        label: 'Dirección',
        help: 'Gerencia y directorio: aprueban lo que excede a las áreas.',
      },
    },
  ),
);

export const internalUserStatusDomain = defineDomain(
  'auth.internalUserStatus',
  'Estado de la cuenta de un usuario interno.',
  labelled(['active', 'invited', 'suspended', 'locked', 'disabled'] as const, {
    active: {
      label: 'Activo',
      help: 'Puede entrar y usar todo lo que su rol le permite.',
    },
    invited: {
      label: 'Invitado',
      help: 'Se le creó la cuenta pero todavía no completó su primer ingreso.',
    },
    suspended: {
      label: 'Suspendido',
      help: 'Acceso cortado por decisión administrativa, por ejemplo una licencia.',
    },
    locked: {
      label: 'Bloqueado',
      help: 'Por intentos fallidos; se desbloquea sin cambiar el rol.',
    },
    disabled: {
      label: 'Deshabilitado',
      help: 'Se fue de la empresa; la cuenta queda cerrada de forma definitiva.',
    },
  }),
);

export const businessActionStatusDomain = defineDomain(
  'audit.businessActionStatus',
  'Desenlace de una acción de negocio registrada.',
  labelled(['SUCCESS', 'FAILED', 'PARTIAL'] as const, {
    SUCCESS: {
      label: 'Correcta',
      help: 'La acción terminó e hizo todo lo que prometía.',
    },
    FAILED: {
      label: 'Fallida',
      help: 'No llegó a hacer nada; el error queda en el registro.',
    },
    PARTIAL: {
      label: 'Parcial',
      help: 'Una parte se aplicó y otra no; es la que exige revisión manual.',
    },
  }),
);

export const documentNoticeLevelDomain = defineDomain(
  'documents.noticeLevel',
  'Tono de un aviso impreso en un documento generado.',
  labelled(['positive', 'caution', 'critical'] as const, {
    positive: {
      label: 'Informativo',
      help: 'Dato útil en verde; no pide ninguna acción a quien lo lee.',
    },
    caution: {
      label: 'Precaución',
      help: 'Advierte algo a tener en cuenta, como una fecha límite.',
    },
    critical: {
      label: 'Crítico',
      help: 'Destaca en rojo lo que no se puede pasar por alto.',
    },
  }),
);

export const PLATFORM_DOMAINS = [
  planTierDomain,
  planStatusDomain,
  portalCampaignToggleDomain,
  activeInactiveDomain,
  bankInstitutionDomain,
  merchantUserRoleDomain,
  fileOwnerTypeDomain,
  evidenceContentTypeDomain,
  internalDepartmentDomain,
  internalUserStatusDomain,
  businessActionStatusDomain,
  documentNoticeLevelDomain,
] as const;
