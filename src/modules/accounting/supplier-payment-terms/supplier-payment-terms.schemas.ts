import { z } from 'zod';
import {
  BASES_DE_COMPUTO,
  ESTADOS_CONDICION,
  FRECUENCIAS,
  MEDIOS_DE_PAGO,
  MODALIDADES_DE_PAGO,
} from './payment-terms.catalog';

/**
 * Qué se admite al pactar una condición de pago con un proveedor.
 *
 * Los vocabularios salen del catálogo del dominio y no de una lista repetida aquí: son los mismos
 * que explican cada término en pantalla y los que gobiernan el cálculo de la fecha, y tenerlos dos
 * veces es la forma segura de que un día se acepte una modalidad que el cálculo no sabe tratar.
 */

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.');
const porcentaje = z.coerce.number().min(0).max(100);

const modalidades = Object.keys(MODALIDADES_DE_PAGO) as [string, ...string[]];
const bases = Object.keys(BASES_DE_COMPUTO) as [string, ...string[]];
const medios = Object.keys(MEDIOS_DE_PAGO) as [string, ...string[]];
const frecuencias = Object.keys(FRECUENCIAS) as [string, ...string[]];
const estados = Object.keys(ESTADOS_CONDICION) as [string, ...string[]];

export const createSupplierPaymentTermsSchema = z
  .object({
    legalEntityId: uuid,
    supplierBpId: uuid,
    code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
    name: z.string().trim().min(3).max(140),
    description: z.string().trim().max(2000).optional(),
    currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()),
    modality: z.enum(modalidades),
    computationBase: z.enum(bases).default('FECHA_FACTURA'),
    termDays: z.coerce.number().int().min(0).max(3650).default(0),
    frequency: z.enum(frecuencias).default('UNICA'),
    paymentMethod: z.enum(medios),
    bpBankAccountId: uuid.nullable().optional(),
    advancePercentage: porcentaje.default(0),
    withholdingCodes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    earlyPaymentDiscount: porcentaje.default(0),
    specialConditions: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z.enum(estados).default('BORRADOR'),
    validFrom: fecha,
    validTo: fecha.nullable().optional(),
  })
  .superRefine((input, context) => {
    // La vigencia invertida la rechaza también la tabla; comprobarla aquí da un mensaje que dice
    // qué campo está mal en vez de un error de restricción con el nombre del índice.
    if (input.validTo && input.validTo < input.validFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validTo'],
        message: 'La vigencia no puede terminar antes de empezar.',
      });
    }
  });

export const updateSupplierPaymentTermsSchema = z
  .object({
    name: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    modality: z.enum(modalidades).optional(),
    computationBase: z.enum(bases).optional(),
    termDays: z.coerce.number().int().min(0).max(3650).optional(),
    frequency: z.enum(frecuencias).optional(),
    paymentMethod: z.enum(medios).optional(),
    bpBankAccountId: uuid.nullable().optional(),
    advancePercentage: porcentaje.optional(),
    withholdingCodes: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    earlyPaymentDiscount: porcentaje.optional(),
    specialConditions: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(estados).optional(),
    validFrom: fecha.optional(),
    validTo: fecha.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indique al menos un campo a modificar.',
  });

export const listSupplierPaymentTermsQuerySchema = z.object({
  legalEntityId: uuid.optional(),
  supplierBpId: uuid.optional(),
  status: z.enum(estados).optional(),
});

/**
 * Simular el calendario de una factura contra la condición vigente.
 *
 * Es el uso REAL del cálculo: antes de emitir el pago, ver en qué fecha vence y cuánto se adelanta.
 */
export const simulateSupplierScheduleSchema = z.object({
  invoiceDate: fecha,
  receptionDate: fecha.nullable().optional(),
  amount: z.coerce.number().finite().min(0),
});

export type CreateSupplierPaymentTermsDto = z.infer<typeof createSupplierPaymentTermsSchema>;
export type UpdateSupplierPaymentTermsDto = z.infer<typeof updateSupplierPaymentTermsSchema>;
export type ListSupplierPaymentTermsQueryDto = z.infer<typeof listSupplierPaymentTermsQuerySchema>;
export type SimulateSupplierScheduleDto = z.infer<typeof simulateSupplierScheduleSchema>;
