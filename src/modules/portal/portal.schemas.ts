import { z } from 'zod';
import {
  PORTAL_DEFAULT_PAGE_SIZE,
  PORTAL_MAX_PAGE_SIZE,
  PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES,
} from './portal.constants';

const uuid = z.string().uuid();

/**
 * Los identificadores de cuenta y anunciante son OPCIONALES a propósito.
 *
 * Para un usuario del comercio el alcance se deriva de sus membresías (`PortalScopeService`), así
 * que enviarlos es innecesario y, cuando se envían, se validan contra ese alcance. Se mantienen
 * admitidos para el staff interno, que sí opera en nombre de un comercio concreto, y para no
 * romper a los clientes existentes que ya los envían.
 */
const optionalAccountId = uuid.optional();

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(PORTAL_MAX_PAGE_SIZE)
    .default(PORTAL_DEFAULT_PAGE_SIZE),
});

/**
 * Tarifa unitaria, en unidades de la moneda del plan.
 *
 * Quien la escribe es una persona del área comercial en un formulario, así que se recibe como
 * «2,50» y no como micros; la conversión a micros —que es como se guarda para que repartir un CPM
 * entre mil impresiones no se redondee a cero— la hace el servicio. Se admiten cuatro decimales
 * porque un CPC de Bs 0,0125 es un precio real y truncarlo a dos cambiaría lo pactado.
 */
const tariffPrice = z.coerce.number().min(0).max(9_999_999).multipleOf(0.0001);

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), 'La moneda debe ser un código ISO de 3 letras.');

export const createPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'El código solo admite mayúsculas, dígitos y guion bajo.'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  tier: z.enum(['STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE']).default('STANDARD'),
  /*
   * La cuota mensual dejó de ser el precio y por eso ya no es obligatoria: lo que distingue a una
   * tarifa de otra son `cpmPrice` y `cpcPrice`. Se sigue admitiendo, en cero, para no romper a
   * quien todavía la envía.
   */
  monthlyPrice: z.coerce.number().min(0).max(9_999_999_999).multipleOf(0.01).default(0),
  /** Precio por cada 1.000 personas alcanzadas. */
  cpmPrice: tariffPrice,
  /** Precio por clic recibido. */
  cpcPrice: tariffPrice,
  currency: currencyCode.default('BOB'),
  features: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

/**
 * Edición de una tarifa ya publicada.
 *
 * El `code` NO se puede cambiar: es la clave con la que la siembra y los informes reconocen a la
 * tarifa, y renombrarlo convertiría el histórico en el de otra cosa. Todo lo demás es opcional y
 * se exige al menos un campo, para que un PATCH vacío falle en vez de escribir una fila idéntica y
 * dejar una entrada de auditoría que no significa nada.
 */
export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    tier: z.enum(['STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE']).optional(),
    monthlyPrice: z.coerce.number().min(0).max(9_999_999_999).multipleOf(0.01).optional(),
    cpmPrice: tariffPrice.optional(),
    cpcPrice: tariffPrice.optional(),
    currency: currencyCode.optional(),
    features: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indique al menos un campo para actualizar.',
  });

export const billingProductsQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).default('false'),
});

export const subscribeSchema = z.object({
  merchantAccountId: optionalAccountId,
  planId: uuid,
  autoRenew: z.boolean().default(true),
});

export const subscriptionQuerySchema = z.object({ merchantAccountId: optionalAccountId });

export const branchesQuerySchema = paginationSchema.extend({
  // `accountId` es el nombre histórico del parámetro en este endpoint.
  accountId: optionalAccountId,
});

export const plansQuerySchema = paginationSchema.extend({
  // Se mantiene como enum textual (y no como transformación a booleano) para que el esquema
  // conserve el mismo tipo de entrada y de salida, que es lo que exige `ZodValidationPipe`.
  includeInactive: z.enum(['true', 'false']).default('false'),
});

export const advertisersQuerySchema = paginationSchema.extend({
  merchantAccountId: optionalAccountId,
});

export const campaignsQuerySchema = paginationSchema.extend({
  advertiserId: uuid,
});

export const idParamsSchema = z.object({ id: uuid });

/** Control acotado: el comercio solo puede prender/apagar campañas ya lanzadas. */
export const setCampaignStatusSchema = z.object({
  status: z.enum(PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES),
  reason: z.string().trim().min(8).max(500).optional(),
});

export type CreatePlanDto = z.infer<typeof createPlanSchema>;
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;
export type BillingProductsQueryDto = z.infer<typeof billingProductsQuerySchema>;
export type SubscribeDto = z.infer<typeof subscribeSchema>;
export type SubscriptionQueryDto = z.infer<typeof subscriptionQuerySchema>;
export type BranchesQueryDto = z.infer<typeof branchesQuerySchema>;
export type CreatePortalBranchDto = z.infer<typeof createPortalBranchSchema>;
export type UpdatePortalBranchDto = z.infer<typeof updatePortalBranchSchema>;
export type SetPortalBranchStatusDto = z.infer<typeof setPortalBranchStatusSchema>;
export type PlansQueryDto = z.infer<typeof plansQuerySchema>;
export type AdvertisersQueryDto = z.infer<typeof advertisersQuerySchema>;
export type CampaignsQueryDto = z.infer<typeof campaignsQuerySchema>;
export type IdParamsDto = z.infer<typeof idParamsSchema>;
export type SetCampaignStatusDto = z.infer<typeof setCampaignStatusSchema>;

/*
 * Sucursales gestionadas por el propio comercio.
 *
 * Hasta ahora las sucursales sólo se podían crear desde `/b2b/*`, que es el canal interno de Atlas:
 * el comercio veía el formulario y recibía un 403. Estos esquemas son la versión del portal, donde
 * la cuenta NO viaja desde el navegador —la resuelve `PortalScopeService` con las membresías— para
 * que nadie pueda dar de alta una sucursal en la cuenta de otro.
 */
export const createPortalBranchSchema = z.object({
  merchantAccountId: optionalAccountId,
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
});

export const updatePortalBranchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    city: z.string().trim().max(120).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indique al menos un campo a modificar.',
  });

export const setPortalBranchStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

/*
 * `canOriginateBnpl` NO está en estos esquemas a propósito.
 *
 * Es el permiso para vender a crédito en ese local, y quien lo concede es Atlas tras evaluar al
 * comercio, no el comercio marcando una casilla en su propio portal. Se sigue editando desde el
 * canal interno (`PATCH /b2b/onboarding/branches/:branchId`).
 */
