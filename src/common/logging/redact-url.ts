/**
 * La URL de una petición tal como puede ir a un log o a una traza: la ruta entera y, de la
 * consulta, sólo los NOMBRES de los parámetros.
 *
 * Los valores de la consulta son justo lo que no debe salir del proceso: un término de búsqueda
 * con el nombre y el documento de una persona (`?search=`), un correo, o un token que algún
 * cliente pone en la URL. Se registraban enteros en cuatro sitios —el guard de JWT, el
 * interceptor de logs, `pino-http` y la traza HTTP— (P-13). Conservar los nombres deja ver QUÉ se
 * pidió sin guardar CON QUÉ.
 */
export const REDACTED_VALUE = '[REDACTED]';

export function redactUrlQuery(url: string | undefined | null): string {
  if (!url) return '';
  const questionMark = url.indexOf('?');
  if (questionMark === -1) return url;
  const path = url.slice(0, questionMark);
  const query = redactQueryValues(url.slice(questionMark + 1));
  return query ? `${path}?${query}` : path;
}

/** `a=1&b=2` → `a=[REDACTED]&b=[REDACTED]`; sin valores inventados para claves vacías. */
export function redactQueryValues(query: string): string {
  const keys: string[] = [];
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const key = pair.split('=')[0] ?? '';
    keys.push(key);
  }
  return keys.map((key) => `${key}=${REDACTED_VALUE}`).join('&');
}
