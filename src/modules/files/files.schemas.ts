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

/** Los tipos que el almacén de evidencia de Atlas admite y verifica por magic bytes. */
export const fileContentTypeEnum = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Permiso de subida. Antes era una «firma de Cloudinary» que sólo cubría la carpeta; ahora es un
 * ticket firmado de AtlasBackend que fija tipo y tamaño: el almacén rechaza lo que no coincida.
 */
export const uploadSignatureSchema = z.object({
  ownerType: fileOwnerTypeEnum,
  ownerId: uuid,
  contentType: fileContentTypeEnum,
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
});

/** El archivo ya subido. AtlasBackend lo verifica (prefijo, existencia, hash, tipo real) antes de registrarlo. */
export const registerFileSchema = z.object({
  ownerType: fileOwnerTypeEnum,
  ownerId: uuid,
  fileName: z.string().min(1).max(240),
  storageKey: z.string().min(1).max(300),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  contentType: fileContentTypeEnum,
  byteSize: z.number().int().positive().max(MAX_FILE_BYTES),
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
