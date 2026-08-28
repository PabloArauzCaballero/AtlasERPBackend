import type { QueryTypes as QueryTypesEnum, Transaction } from 'sequelize';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';

export interface DocumentNumberRequest {
  /** Prefijo del correlativo, sin el año ni el número. Ej.: `FAC-AR`. */
  prefix: string;
  /** Tabla calificada donde vive el correlativo. Ej.: `atlas_accounting.ar_invoice`. */
  table: string;
  /** Columna del número. Ej.: `invoice_no`. */
  column: string;
  /** Fecha del documento: decide el año de la serie. */
  date: Date | string;
  /**
   * Ámbito de la serie: la columna y el valor que la separan de las demás.
   *
   * Las facturas AR son únicas por entidad legal, así que cada entidad lleva su propia numeración.
   * Las de comercio son únicas en toda la instalación y no llevan ámbito.
   */
  scope?: { column: string; value: string } | undefined;
  /** Dígitos del correlativo. */
  padding?: number | undefined;
}

/** Año de la serie a partir de la fecha del documento (`AAAA-MM-DD` o `Date`). */
function serieYear(date: Date | string): string {
  if (date instanceof Date) return String(date.getUTCFullYear());
  const match = /^(\d{4})/.exec(String(date));
  return match?.[1] ?? String(new Date().getUTCFullYear());
}

/**
 * Siguiente número de una serie documental, dentro de la transacción que emite el documento.
 *
 * El número de factura no lo escribe quien la emite: lo lleva el sistema. Si lo teclea el usuario,
 * dos personas emiten la misma serie a la vez, se saltan números sin querer, o repiten uno y el
 * choque sale como un error de base de datos ilegible; y un correlativo con huecos o repetido es
 * exactamente lo que una revisión fiscal mira primero.
 *
 * El correlativo se calcula leyendo el último de la serie, así que dos emisiones simultáneas leerían
 * el mismo máximo. Un **bloqueo de aviso por serie** —que dura lo que dure la transacción— las pone
 * en fila: la segunda espera al COMMIT de la primera y ve su número ya escrito. Es más barato que
 * bloquear la tabla y no depende de que exista una secuencia por entidad.
 */
export async function nextDocumentNumber(
  sequelize: Sequelize,
  request: DocumentNumberRequest,
  transaction: Transaction,
): Promise<string> {
  const year = serieYear(request.date);
  const padding = request.padding ?? 6;
  const prefix = `${request.prefix}-${year}-`;
  const scopeKey = request.scope ? `${request.scope.column}:${request.scope.value}` : 'global';

  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', {
    replacements: { clave: `${request.table}.${request.column}:${scopeKey}:${prefix}` },
    transaction,
    type: QueryTypes.SELECT as QueryTypesEnum.SELECT,
  });

  const scopeFilter = request.scope ? `AND "${request.scope.column}" = :scopeValue` : '';
  const rows = await sequelize.query<{ ultimo: string | null }>(
    `SELECT MAX("${request.column}") AS ultimo FROM ${request.table} ` +
      `WHERE "${request.column}" LIKE :prefijo ${scopeFilter}`,
    {
      replacements: {
        prefijo: `${prefix}%`,
        ...(request.scope ? { scopeValue: request.scope.value } : {}),
      },
      transaction,
      type: QueryTypes.SELECT as QueryTypesEnum.SELECT,
    },
  );

  const ultimo = rows[0]?.ultimo ?? null;
  const correlativo = ultimo ? Number.parseInt(ultimo.slice(prefix.length), 10) : 0;
  const siguiente = Number.isFinite(correlativo) ? correlativo + 1 : 1;
  return `${prefix}${String(siguiente).padStart(padding, '0')}`;
}
