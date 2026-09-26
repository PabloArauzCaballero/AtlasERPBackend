import type { Sequelize, Transaction } from 'sequelize';

/**
 * Lo mínimo de `pg.Client`/`pg.PoolClient` que usan el relay del outbox y la inbox: parámetros
 * posicionales `$1…` y filas de vuelta. Las sentencias que necesitan saber «cuántas filas tocó»
 * usan `RETURNING`, así que no hace falta `rowCount`.
 */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * El mismo contrato sobre Sequelize, para usarlo desde un servicio de Nest. Con `transaction`
 * todas las sentencias van en ella: así la inbox y el efecto comparten transacción.
 */
export function sequelizeQueryable(sequelize: Sequelize, transaction?: Transaction): Queryable {
  return {
    async query<R extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const [rows] = await sequelize.query(sql, { bind: params, transaction });
      return { rows: rows as R[] };
    },
  };
}

/** Ejecuta `work` entre BEGIN y COMMIT sobre un cliente `pg` dedicado; ROLLBACK si lanza. */
export async function inPgTransaction<T>(
  client: Queryable,
  work: (tx: Queryable) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
