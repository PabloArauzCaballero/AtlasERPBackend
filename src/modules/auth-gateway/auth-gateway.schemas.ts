import { z } from 'zod';

const numericIdSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, 'id debe ser un identificador numérico positivo.');

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

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
