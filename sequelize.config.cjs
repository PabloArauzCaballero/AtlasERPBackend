require('dotenv/config');
const { readFileSync } = require('node:fs');

const url = process.env.DATABASE_URL;

/**
 * Mismo criterio que `src/config/db-ssl.ts`, reescrito en CommonJS porque sequelize-cli
 * carga este fichero fuera del build de TypeScript.
 *
 * Lo que se corrige aquí: los tres entornos declaraban `rejectUnauthorized: false`, así que
 * la CLI de migraciones —que corre con permisos de DDL sobre la base de producción— cifraba
 * sin comprobar contra quién. Ahora se valida por defecto; para una autoridad interna se
 * declara la CA, y sólo apagando la comprobación a propósito se vuelve al comportamiento
 * anterior.
 */
function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const ca =
    process.env.DB_SSL_CA && process.env.DB_SSL_CA.trim().length > 0
      ? process.env.DB_SSL_CA
      : process.env.DB_SSL_CA_FILE
        ? readFileSync(process.env.DB_SSL_CA_FILE, 'utf8')
        : undefined;

  return {
    ssl: {
      require: true,
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ...(ca ? { ca } : {}),
    },
  };
}

const dialectOptions = sslOptions();

module.exports = {
  development: {
    url,
    dialect: 'postgres',
    dialectOptions,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  },
  test: {
    url,
    dialect: 'postgres',
    dialectOptions,
    logging: false,
  },
  production: {
    url,
    dialect: 'postgres',
    dialectOptions,
    logging: false,
  },
};
