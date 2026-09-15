import { z } from 'zod';

/**
 * Contrato del formulario EN BLANCO (`blank-form@1.0.0` del worker), recortado a lo que el ERP
 * manda. Espejo del esquema del worker por las mismas dos razones que `generateDocumentSchema`:
 * tamaño (esta ruta hace trabajar a Chromium) y mensaje (un rechazo con el formato del ERP).
 *
 * Los `kind` son los del worker; si allí se añade uno, aquí también, o el ERP lo rechazará antes
 * de que el worker lo vea.
 */
export const BLANK_FORM_FIELD_KINDS = [
  'text',
  'number',
  'date',
  'datetime',
  'textarea',
  'select',
  'multiselect',
  'chips',
  'countryCity',
  'address',
  'boolean',
  'file',
  'email',
  'url',
  'phone',
] as const;

export type BlankFormFieldKind = (typeof BLANK_FORM_FIELD_KINDS)[number];

const celda = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

const opcion = z.object({
  code: z.string().max(40).optional(),
  label: z.string().min(1).max(120),
});

export const blankFormFieldSchema = z.object({
  label: z.string().min(1).max(120),
  kind: z.enum(BLANK_FORM_FIELD_KINDS),
  required: z.boolean().optional(),
  hint: z.string().max(240).optional(),
  options: z.array(opcion).max(12).optional(),
  catalogRef: z.string().max(120).optional(),
  width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  lines: z.number().int().min(1).max(8).optional(),
  prefilled: celda.optional(),
});

const tabla = z.object({
  columns: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        numeric: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(8),
  rows: z.number().int().min(1).max(60),
  totalRow: z.boolean().optional(),
});

const seccion = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().max(1_000).optional(),
    pageBreakBefore: z.boolean().optional(),
    fields: z.array(blankFormFieldSchema).max(80).optional(),
    table: tabla.optional(),
  })
  .refine((s) => (s.fields?.length ?? 0) > 0 || s.table !== undefined, {
    message: 'Una sección tiene campos, una tabla o las dos cosas.',
  });

export const blankFormPayloadSchema = z
  .object({
    formCode: z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,63}$/),
    formVersion: z.string().min(1).max(16),
    title: z.string().min(1).max(160),
    subtitle: z.string().max(240).optional(),
    instructions: z.array(z.string().min(1).max(300)).max(8).optional(),
    context: z
      .array(z.object({ label: z.string().min(1).max(80), value: celda }))
      .max(12)
      .optional(),
    sections: z.array(seccion).min(1).max(40),
    annexes: z
      .array(
        z.object({
          title: z.string().min(1).max(120),
          entries: z
            .array(z.object({ code: z.string().min(1).max(40), label: z.string().min(1).max(160) }))
            .min(1)
            .max(400),
        }),
      )
      .max(12)
      .optional(),
    declarations: z.array(z.string().min(1).max(600)).max(6).optional(),
    signatures: z
      .array(z.object({ name: z.string().min(1).max(120), role: z.string().max(120).optional() }))
      .max(3)
      .optional(),
  })
  .superRefine((form, ctx) => {
    const campos = form.sections.reduce((n, s) => n + (s.fields?.length ?? 0), 0);
    if (campos > 200)
      ctx.addIssue({
        code: 'custom',
        message: `Hasta 200 campos; llegaron ${campos}.`,
        path: ['sections'],
      });
    const renglones = form.sections.reduce((n, s) => n + (s.table?.rows ?? 0), 0);
    if (renglones > 200)
      ctx.addIssue({
        code: 'custom',
        message: `Hasta 200 renglones; llegaron ${renglones}.`,
        path: ['sections'],
      });
    const anexos = new Set((form.annexes ?? []).map((a) => a.title));
    form.sections.forEach((s, i) =>
      (s.fields ?? []).forEach((f, j) => {
        if (f.catalogRef && !anexos.has(f.catalogRef)) {
          ctx.addIssue({
            code: 'custom',
            message: `«${f.label}» apunta al anexo «${f.catalogRef}», que no existe.`,
            path: ['sections', i, 'fields', j, 'catalogRef'],
          });
        }
      }),
    );
  });

export type BlankFormPayload = z.infer<typeof blankFormPayloadSchema>;
