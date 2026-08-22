/**
 * TLS de la conexión a la base de datos, resuelto en un solo sitio.
 *
 * Antes cada punto de conexión —el módulo de Sequelize, el worker de outbox, los cinco
 * scripts de base— escribía `ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined`.
 * Eso significa que activar TLS DESACTIVABA la validación del certificado: el tráfico iba
 * cifrado, pero contra cualquiera que se presentara en el puerto. Un intermediario en la
 * red entre la aplicación y Postgres podía terminar la sesión con un certificado propio y
 * leer —y modificar— todo lo que pasa por ahí, que en este backend es contabilidad,
 * facturación y datos personales de clientes.
 *
 * Y no era un descuido de un entorno suelto: `env.ts` EXIGE `DB_SSL=true` en producción,
 * así que producción era precisamente el entorno que corría con validación desactivada.
 *
 * El cifrado sin autenticación del extremo no es cifrado, es ofuscación. Un supervisor que
 * revise el cumplimiento del cifrado en tránsito mira exactamente esta línea.
 *
 * Cómo queda:
 *   · `DB_SSL=false` — sin TLS. Sólo válido fuera de producción; `env.ts` lo bloquea allí.
 *   · `DB_SSL=true` — TLS con el certificado VALIDADO contra las CA del sistema.
 *   · `DB_SSL_CA` / `DB_SSL_CA_FILE` — CA propia, para el Postgres gestionado que presenta
 *     un certificado firmado por una autoridad interna. Sigue validando: cambia contra
 *     QUÉ se valida, no si se valida.
 *   · `DB_SSL_REJECT_UNAUTHORIZED=false` — la puerta de atrás de siempre, que ahora hay que
 *     abrir a propósito y que `env.ts` prohíbe en producción. Existe para el `docker
 *     compose` local con certificado autofirmado y para nada más.
 */
import { readFileSync } from 'node:fs';

export interface DbSslOptions {
  readonly rejectUnauthorized: boolean;
  readonly ca?: string;
}

export interface DbSslInput {
  readonly DB_SSL: boolean;
  readonly DB_SSL_REJECT_UNAUTHORIZED: boolean;
  readonly DB_SSL_CA?: string | undefined;
  readonly DB_SSL_CA_FILE?: string | undefined;
}

/**
 * La CA en texto gana sobre el fichero: en un contenedor el PEM suele llegar por variable
 * de entorno y montar además un fichero es el caso raro. Si el fichero no se puede leer se
 * falla en el arranque en vez de seguir con las CA del sistema, que aceptarían un
 * certificado distinto del que el operador quiso fijar.
 */
function resolveCa(config: DbSslInput): string | undefined {
  if (config.DB_SSL_CA && config.DB_SSL_CA.trim().length > 0) return config.DB_SSL_CA;
  if (!config.DB_SSL_CA_FILE) return undefined;
  try {
    return readFileSync(config.DB_SSL_CA_FILE, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo leer DB_SSL_CA_FILE (${config.DB_SSL_CA_FILE}): ${detail}`);
  }
}

/** Opciones para `pg` (`new Client({ ssl })`). `false` significa conexión sin TLS. */
export function resolveDbSslOptions(config: DbSslInput): DbSslOptions | false {
  if (!config.DB_SSL) return false;
  const ca = resolveCa(config);
  return {
    rejectUnauthorized: config.DB_SSL_REJECT_UNAUTHORIZED,
    ...(ca ? { ca } : {}),
  };
}

/**
 * Lo mismo para Sequelize, que lo espera anidado bajo `dialectOptions`.
 *
 * `require: true` se mantiene junto a las opciones de verificación: le dice al driver que
 * exija TLS en vez de aceptar la negociación en claro que ofrezca el servidor.
 */
export function resolveSequelizeSslOptions(
  config: DbSslInput,
): { readonly dialectOptions: { readonly ssl: DbSslOptions & { require: true } } } | undefined {
  const ssl = resolveDbSslOptions(config);
  if (!ssl) return undefined;
  return { dialectOptions: { ssl: { require: true, ...ssl } } };
}
