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
    STARTER: 'Inicial',
    STANDARD: 'Estándar',
    PREMIUM: 'Premium',
    ENTERPRISE: 'Empresarial',
  }),
  [{ check: 'ck_merchant_plans_tier' }],
);

export const planStatusDomain = defineDomain(
  'portal.planStatus',
  'Estado de un plan comercial.',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: 'Activo',
    INACTIVE: { label: 'Inactivo', help: 'No se ofrece a comercios nuevos.' },
    ARCHIVED: 'Archivado',
  }),
  [{ check: 'ck_merchant_plans_status' }],
);

export const portalCampaignToggleDomain = defineDomain(
  'portal.campaignToggle',
  'Estados de campaña que el comercio puede alternar desde el portal.',
  labelled(PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES, { ACTIVE: 'Activa', PAUSED: 'Pausada' }),
);

export const activeInactiveDomain = defineDomain(
  'platform.activeInactive',
  'Estado simple de un registro que sólo se enciende o se apaga.',
  labelled(['ACTIVE', 'INACTIVE'] as const, { ACTIVE: 'Activo', INACTIVE: 'Inactivo' }),
);

/*
 * Siglas de la Autoridad de Supervisión del Sistema Financiero (ASFI) de las entidades con las que
 * un comercio suele cobrar por QR. El QR bancario viaja a AtlasBackend, que valida el FORMATO de la
 * sigla (`^[A-Z0-9]{2,16}$`); esta lista es la que evita que el comercio la teclee de memoria. Una
 * entidad que no esté se elige como `OTRA` y la revisión del QR la resuelve.
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
      BNB: 'Banco Nacional de Bolivia',
      BME: 'Banco Mercantil Santa Cruz',
      BUN: 'Banco Unión',
      BCR: 'Banco de Crédito de Bolivia (BCP)',
      BIS: 'Banco BISA',
      BGA: 'Banco Ganadero',
      BEC: 'Banco Económico',
      BSO: 'Banco Solidario (BancoSol)',
      BIE: 'Banco FIE',
      BPR: 'Banco Prodem',
      BFO: 'Banco Fortaleza',
      BDP: 'Banco de Desarrollo Productivo',
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
      BRANCH_MANAGER: 'Gerente de sucursal',
      MERCHANT_OPERATOR: 'Operador',
      FINANCIAL_AUDITOR: 'Auditor financiero',
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
      GL_ACCOUNT: 'Cuenta contable',
      BUSINESS_PARTNER: 'Business partner',
      ACCOUNTING_DOCUMENT: 'Documento contable',
      JOURNAL_ENTRY: 'Asiento',
      CONTRACT: 'Contrato',
      B2B_ACCOUNT: 'Cuenta comercial',
      OPPORTUNITY: 'Oportunidad',
      MERCHANT: 'Comercio',
      LEGAL_ENTITY: 'Entidad legal',
      OTHER: 'Otro',
    },
  ),
);

export const evidenceContentTypeDomain = defineDomain(
  'files.contentType',
  'Tipos de archivo que admite el almacén de evidencia.',
  labelled(['application/pdf', 'image/jpeg', 'image/png'] as const, {
    'application/pdf': 'PDF',
    'image/jpeg': 'Imagen JPEG',
    'image/png': 'Imagen PNG',
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
      OPERATIONS: 'Operaciones',
      RISK: 'Riesgo',
      COLLECTIONS: 'Cobranza',
      COMPLIANCE: 'Cumplimiento',
      FINANCE: 'Finanzas',
      SUPPORT: 'Soporte',
      SYSTEMS: 'Sistemas',
      AUDIT: 'Auditoría',
      EXECUTIVE: 'Dirección',
    },
  ),
);

export const internalUserStatusDomain = defineDomain(
  'auth.internalUserStatus',
  'Estado de la cuenta de un usuario interno.',
  labelled(['active', 'invited', 'suspended', 'locked', 'disabled'] as const, {
    active: 'Activo',
    invited: 'Invitado',
    suspended: 'Suspendido',
    locked: {
      label: 'Bloqueado',
      help: 'Por intentos fallidos; se desbloquea sin cambiar el rol.',
    },
    disabled: 'Deshabilitado',
  }),
);

export const businessActionStatusDomain = defineDomain(
  'audit.businessActionStatus',
  'Desenlace de una acción de negocio registrada.',
  labelled(['SUCCESS', 'FAILED', 'PARTIAL'] as const, {
    SUCCESS: 'Correcta',
    FAILED: 'Fallida',
    PARTIAL: 'Parcial',
  }),
);

export const documentNoticeLevelDomain = defineDomain(
  'documents.noticeLevel',
  'Tono de un aviso impreso en un documento generado.',
  labelled(['positive', 'caution', 'critical'] as const, {
    positive: 'Informativo',
    caution: 'Precaución',
    critical: 'Crítico',
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
