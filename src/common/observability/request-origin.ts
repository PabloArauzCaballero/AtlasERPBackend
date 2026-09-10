/**
 * El origen que declara quien llama: desde qué pantalla (`x-atlas-flow`) y qué cliente
 * (`x-atlas-product`).
 *
 * Las reglas son las MISMAS que aplica AtlasBackend (`http-action-log.interceptor.ts`), y no por
 * estética: lo que aquí se cuenta lo cruza él contra su catálogo de pantallas. Un patrón o una
 * normalización distintos no darían un error, darían cero coincidencias, que se leería como «nadie
 * usa el portal del ERP».
 *
 * Se descarta lo que no encaje, sin truncar ni sanear: una ruta a medias identificaría una pantalla
 * equivocada, que es peor que no identificar ninguna.
 */
const ORIGIN_SCREEN_PATTERN = /^\/[A-Za-z0-9/_:.-]{0,199}$/;
const ORIGIN_CLIENT_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;

export interface RequestOrigin {
  /** Código del catálogo de pantallas: `erp-portal` → `ERP_PORTAL`. */
  client: string;
  /** Ruta CONCRETA, tal como la declaró el cliente; la plantilla la resuelve quien tiene el catálogo. */
  screen: string;
}

export function requestOrigin(header: (name: string) => string | undefined): RequestOrigin | null {
  const screen = header('x-atlas-flow');
  const client = header('x-atlas-product');
  // Sin cliente no se puede atribuir: `/` es una pantalla distinta en cada portal.
  if (
    !screen ||
    !client ||
    !ORIGIN_SCREEN_PATTERN.test(screen) ||
    !ORIGIN_CLIENT_PATTERN.test(client)
  ) {
    return null;
  }
  return { client: client.replace(/-/g, '_').toUpperCase(), screen };
}
