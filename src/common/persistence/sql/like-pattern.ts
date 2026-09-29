/**
 * Patrón `ILIKE` de «contiene» con los comodines del usuario ESCAPADOS.
 *
 * Sin escapar, un `%` o un `_` que alguien teclea (`Café_Bar`, `100%`) deja de ser texto y pasa a
 * ser comodín: `_` casa con cualquier carácter y `%` con cualquier cosa, así que el filtro devuelve
 * filas que no contienen lo escrito. PostgreSQL usa `\` como carácter de escape por defecto en
 * `LIKE`/`ILIKE`, y el valor viaja como parámetro, así que basta con anteponerlo.
 */
export function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `%<valor escapado>%`: casa con el valor exacto y con todo lo que lo contiene. */
export function containsPattern(value: string): string {
  return `%${escapeLikeLiteral(value)}%`;
}
