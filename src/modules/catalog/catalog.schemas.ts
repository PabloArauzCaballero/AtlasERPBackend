import { z } from 'zod';

export const DOMAIN_NAME_PATTERN = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z0-9]*$/;

const domainName = z
  .string()
  .trim()
  .regex(DOMAIN_NAME_PATTERN, 'El nombre de dominio es modulo.nombre.');

/**
 * `?names=a.b,c.d` — vacío o ausente devuelve todos.
 *
 * Se valida como texto y se parte en el controlador: el pipe de Zod exige que entrada y salida
 * tengan el mismo tipo, y una lista separada por comas entra como `string`.
 */
export const catalogDomainsQuerySchema = z.object({
  names: z
    .string()
    .trim()
    .max(4000)
    .regex(/^[a-zA-Z0-9.,\s]*$/, 'Lista de nombres separados por coma.')
    .optional(),
});
export type CatalogDomainsQueryDto = z.infer<typeof catalogDomainsQuerySchema>;

export const catalogDomainParamsSchema = z.object({ name: domainName });
export type CatalogDomainParamsDto = z.infer<typeof catalogDomainParamsSchema>;

export function splitDomainNames(names: string | undefined): string[] | undefined {
  const list = (names ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}
