import { z } from 'zod';

const numericIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, 'id debe ser un identificador numérico positivo.');

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

/** Segundo paso del login interno: el desafío que devolvió el login, más el PIN del correo. */
export const loginPinSchema = z.object({
  challengeToken: z.string().trim().min(20),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'El PIN debe tener exactamente 6 dígitos.'),
});
export type LoginPinDto = z.infer<typeof loginPinSchema>;

/**
 * Cambio de contraseña del usuario autenticado. No lleva email ni id: quién cambia la contraseña
 * sale de la sesión upstream, igual que arriba en AtlasBackend.
 */
export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
});
export type PasswordChangeRequestDto = z.infer<typeof passwordChangeRequestSchema>;

export const passwordChangeConfirmSchema = z.object({
  challengeToken: z.string().trim().min(20),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'El código debe tener exactamente 6 dígitos.'),
  newPassword: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(128),
});
export type PasswordChangeConfirmDto = z.infer<typeof passwordChangeConfirmSchema>;

export const logoutSchema = z.object({
  allDevices: z.boolean().default(false),
});
export type LogoutDto = z.infer<typeof logoutSchema>;

export const internalUserIdParamsSchema = z.object({ id: numericIdSchema });
export type InternalUserIdParamsDto = z.infer<typeof internalUserIdParamsSchema>;

export const internalRoleIdParamsSchema = z.object({ id: numericIdSchema });
export type InternalRoleIdParamsDto = z.infer<typeof internalRoleIdParamsSchema>;

const internalDepartmentSchema = z.enum([
  'OPERATIONS',
  'RISK',
  'COLLECTIONS',
  'COMPLIANCE',
  'FINANCE',
  'SUPPORT',
  'SYSTEMS',
  'AUDIT',
  'EXECUTIVE',
]);

const internalUserStatusSchema = z.enum(['active', 'invited', 'suspended', 'locked', 'disabled']);

export const updateInternalUserSchema = z.object({
  fullName: z.string().trim().min(3).max(180).optional(),
  department: internalDepartmentSchema.optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  status: internalUserStatusSchema.optional(),
  mustChangePassword: z.boolean().optional(),
  reason: z.string().trim().min(8).max(500),
});
export type UpdateInternalUserDto = z.infer<typeof updateInternalUserSchema>;

export const replaceInternalUserRolesSchema = z.object({
  roles: z.array(z.string()).min(1).max(8),
  reason: z.string().trim().min(8).max(500),
});
export type ReplaceInternalUserRolesDto = z.infer<typeof replaceInternalUserRolesSchema>;

/**
 * Login del canal del comercio. Mismo contrato que el interno, población distinta: se separa para
 * que ninguna pantalla del portal pueda intentar autenticarse contra el plano interno por error.
 */
export const merchantLoginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(1).max(128),
});
export type MerchantLoginDto = z.infer<typeof merchantLoginSchema>;

/**
 * «Olvidé mi contraseña». Aquí SÍ viaja el correo, al contrario que en el cambio de contraseña de
 * arriba: quien la pide no tiene sesión, así que no hay de dónde deducir quién es.
 *
 * El mismo par de esquemas sirve a las dos poblaciones —comercio y personal interno—: el contrato
 * es idéntico y a quién se le cambia la contraseña lo decide la RUTA, no el cuerpo. Que el cliente
 * pudiera elegir el tipo de actor en el cuerpo sería un modo de probar correos contra la población
 * que quisiera.
 */
export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(180),
});
export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestSchema>;

/** Nombres anteriores, conservados para no tocar los llamantes del canal del comercio. */
export const merchantPasswordResetRequestSchema = passwordResetRequestSchema;
export type MerchantPasswordResetRequestDto = PasswordResetRequestDto;

/**
 * El mínimo de 10 caracteres es el mismo que aplica AtlasBackend al confirmar. Se repite aquí para
 * que el portal diga qué falta ANTES de gastar el código de un solo uso: si la contraseña no pasa
 * upstream, el código ya se consumió y el comercio tendría que pedir otro.
 */
export const passwordResetConfirmSchema = z.object({
  email: z.string().trim().email().max(180),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'El código debe tener exactamente 6 dígitos.'),
  newPassword: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(128),
});
export type PasswordResetConfirmDto = z.infer<typeof passwordResetConfirmSchema>;

export const merchantPasswordResetConfirmSchema = passwordResetConfirmSchema;
export type MerchantPasswordResetConfirmDto = PasswordResetConfirmDto;
