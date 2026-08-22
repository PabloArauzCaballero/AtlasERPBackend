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
