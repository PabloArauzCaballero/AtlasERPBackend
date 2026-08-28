/**
 * Bandas de negocio derivadas de un dato fino: las mismas para toda segmentación del ERP.
 *
 * Vivían dentro del módulo de Ads, que fue quien las necesitó primero. Al segmentar también
 * partners desde CRM hacía falta la misma banda de tamaño y la misma antigüedad, y tenerlas dos
 * veces —una en TypeScript y otra en el SQL de la proyección, o una por módulo— significa que el
 * día que se mueva el corte de MEDIANA, el mismo comercio caiga en dos bandas distintas según qué
 * pantalla lo mire.
 */

/**
 * Bandas de tamaño por número de empleados.
 *
 * Se segmenta por BANDA y no por el número exacto a propósito: un umbral en 47 empleados no
 * significa nada para nadie, y publicar el dato fino permitiría reconstruir qué comercio es cada
 * impresión cuando el rubro y la ciudad ya acotan mucho.
 */
export function merchantSizeBand(employeeCount: number | null): string | undefined {
  if (employeeCount === null || employeeCount <= 0) return undefined;
  if (employeeCount <= 10) return 'MICRO';
  if (employeeCount <= 50) return 'PEQUENA';
  if (employeeCount <= 200) return 'MEDIANA';
  return 'GRANDE';
}

/**
 * Meses desde el alta de la cuenta.
 *
 * Se mide sobre el alta en la PLATAFORMA y no sobre el año de fundación: lo que un segmento de
 * antigüedad quiere distinguir es cuánto lleva el comercio operando con nosotros, no cuántos años
 * lleva existiendo. Una ferretería de 1980 que entró el mes pasado es un comercio nuevo.
 */
export function tenureMonths(createdAt: Date | null, now: Date): number | undefined {
  if (!createdAt) return undefined;
  /*
   * En UTC, no en hora local. Las fechas se guardan en UTC y el servidor puede correr en cualquier
   * zona: con `getMonth()` un alta del 1 de agosto a medianoche UTC se lee como 31 de julio en
   * cualquier huso al oeste, y la antigüedad sale un mes de más. El error es de UNO y sólo aparece
   * en los primeros días del mes, que es la peor forma de que exista: pasa desapercibido y cambia
   * de qué segmento es un comercio según dónde esté desplegado el proceso.
   */
  const months =
    (now.getUTCFullYear() - createdAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - createdAt.getUTCMonth());
  return months < 0 ? 0 : months;
}
