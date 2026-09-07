import { z } from 'zod';

/**
 * Lo que el ERP acepta imprimir.
 *
 * Es la MISMA forma que el contrato `generic-result-report` del worker, recortada a lo que las
 * pantallas del ERP necesitan. Se valida aquí, aunque el worker vuelva a validar, por dos razones
 * que no son la misma:
 *
 *  - **Tamaño.** Sin topes, esta ruta sería la forma más barata de hacer trabajar a Chromium desde
 *    fuera: un payload de dos megas es un documento de cientos de páginas ocupando un carril.
 *  - **Mensaje.** Un rechazo aquí llega con el formato de error del ERP; uno del worker llega con
 *    el suyo, y quien lo lee no sabría a qué servicio pertenece.
 */
const celda = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

const tabla = z.object({
  columns: z
    .array(z.object({ key: z.string().min(1).max(80), label: z.string().min(1).max(120) }))
    .min(1)
    .max(12),
  rows: z.array(z.record(z.string().max(80), celda)).max(2_000),
});

const seccion = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1_000).optional(),
  pageBreakBefore: z.boolean().optional(),
  fields: z
    .array(z.object({ label: z.string().min(1).max(120), value: celda }))
    .max(60)
    .optional(),
  table: tabla.optional(),
});

export const generateDocumentSchema = z.object({
  /** Nombre propuesto del archivo. El worker lo devuelve en `Content-Disposition`. */
  filename: z.string().trim().min(1).max(120).optional(),
  payload: z.object({
    title: z.string().min(1).max(160),
    subtitle: z.string().max(240).optional(),
    generatedAt: z.string().datetime().optional(),
    summary: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          value: celda,
          caption: z.string().max(120).optional(),
        }),
      )
      .max(4)
      .optional(),
    notices: z
      .array(
        z.object({
          level: z.enum(['positive', 'caution', 'critical']),
          title: z.string().max(120).optional(),
          text: z.string().min(1).max(1_200),
        }),
      )
      .max(8)
      .optional(),
    sections: z.array(seccion).min(1).max(60),
  }),
});

export type GenerateDocumentDto = z.infer<typeof generateDocumentSchema>;
