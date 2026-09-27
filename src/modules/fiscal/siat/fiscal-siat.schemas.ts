import { z } from 'zod';
import { zodEnum } from '../../../common/catalog/domain';
import {
  fiscalIssuerStatusDomain,
  fiscalSourceTypeDomain,
  siatStatusDomain,
} from '../../catalog/domains/accounting.domains';
import { CATALOGOS_SIN } from './application/siat-catalog-sync.service';

const nit = z
  .string()
  .trim()
  .regex(/^[0-9]{1,13}$/, 'El NIT son sólo dígitos (hasta 13).');

export const createIssuerProfileSchema = z
  .object({
    legalEntityId: z.string().uuid(),
    branchId: z.string().uuid().optional(),
    nit,
    razonSocial: z.string().trim().min(1).max(200),
    municipio: z.string().trim().min(1).max(25),
    direccion: z.string().trim().min(1).max(500),
    telefono: z.string().trim().max(25).optional(),
    codigoSucursal: z.number().int().min(0).max(9999).default(0),
    codigoPuntoVenta: z.number().int().min(0).max(9999).default(0),
    /** Sólo la computarizada (2) está implementada; la electrónica (1) necesita firma. */
    codigoModalidad: z.literal(2).default(2),
    actividadEconomica: z
      .string()
      .trim()
      .regex(/^[0-9]{1,10}$/),
    leyendaDefault: z.string().trim().max(200).optional(),
    /** Producto del SIN de las facturas AR (servicios sin catálogo propio). */
    productoSinDefault: z.number().int().positive().max(99_999_999).optional(),
    unidadMedidaDefault: z.number().int().min(1).max(200).default(58),
    usuarioEmisor: z.string().trim().min(1).max(100).default('atlas-erp'),
  })
  .strict();

export const updateIssuerProfileSchema = createIssuerProfileSchema
  .omit({ legalEntityId: true, codigoSucursal: true, codigoPuntoVenta: true, nit: true })
  .partial()
  .extend({ status: zodEnum(fiscalIssuerStatusDomain).optional() })
  .strict();

export const syncCatalogsSchema = z
  .object({
    catalogo: z
      .string()
      .refine((valor) => valor in CATALOGOS_SIN, 'Catálogo del SIN desconocido.')
      .optional(),
  })
  .strict();

export type CreateIssuerProfileDto = z.infer<typeof createIssuerProfileSchema>;
export type UpdateIssuerProfileDto = z.infer<typeof updateIssuerProfileSchema>;
export type SyncCatalogsDto = z.infer<typeof syncCatalogsSchema>;

export const listFiscalDocumentsQuerySchema = z
  .object({
    status: zodEnum(siatStatusDomain).optional(),
    sourceType: zodEnum(fiscalSourceTypeDomain).optional(),
    sourceId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(500).optional(),
  })
  .strict();

export const annulFiscalDocumentSchema = z
  .object({ codigoMotivo: z.number().int().min(1).max(99) })
  .strict();

export type ListFiscalDocumentsQuery = z.infer<typeof listFiscalDocumentsQuerySchema>;
export type AnnulFiscalDocumentDto = z.infer<typeof annulFiscalDocumentSchema>;
