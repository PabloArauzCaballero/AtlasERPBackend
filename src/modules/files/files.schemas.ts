import { z } from 'zod';

const uuid = z.string().uuid();

export const fileOwnerTypeEnum = z.enum([
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
]);

export const uploadSignatureSchema = z.object({
  ownerType: fileOwnerTypeEnum,
  ownerId: uuid,
});

export const registerFileSchema = z.object({
  ownerType: fileOwnerTypeEnum,
  ownerId: uuid,
  fileName: z.string().min(1).max(240),
  storagePublicId: z.string().min(1).max(300),
  secureUrl: z.string().url().max(600),
  mimeType: z.string().max(120).optional(),
  byteSize: z.coerce.number().int().nonnegative().optional(),
  resourceType: z.string().max(20).optional(),
  sha256: z.string().length(64).optional(),
});

export const listFilesQuerySchema = z.object({
  ownerType: fileOwnerTypeEnum,
  ownerId: uuid,
});

export const fileIdParamsSchema = z.object({ id: uuid });

export type UploadSignatureDto = z.infer<typeof uploadSignatureSchema>;
export type RegisterFileDto = z.infer<typeof registerFileSchema>;
export type ListFilesQueryDto = z.infer<typeof listFilesQuerySchema>;
export type FileIdParamsDto = z.infer<typeof fileIdParamsSchema>;
