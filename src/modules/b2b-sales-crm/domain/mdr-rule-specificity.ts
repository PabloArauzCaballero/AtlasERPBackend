/**
 * Cuánto pesa cada dimensión de una regla de comisión (MDR) frente a las demás.
 *
 * ESTA es la única definición del criterio «gana la regla más específica». La usan los dos lados
 * que antes tenían cada uno el suyo:
 *
 *  - el COBRO (`B2BSalesCrmUseCaseBase.pickBestMdrRule`), que elige la regla de una venta, y
 *  - la PANTALLA (`B2BContractsService.listMdrRules`), que las lista «en el orden en que el motor
 *    las elige».
 *
 * El cobro contaba dimensiones con igual peso y la pantalla ponderaba 4/2/1, así que la regla que
 * la pantalla enseñaba como ganadora podía perder al cobrar. Con el conteo:
 *
 *  - una regla de sólo sucursal (1) perdía contra una de categoría + riesgo (2), aunque la
 *    pantalla la daba por ganadora (4 contra 3); y
 *  - dos reglas de una sola dimensión EMPATABAN (sucursal-sola contra categoría-sola) y
 *    ganaba la que la base devolviera primero: la misma venta cobraba distinto según el orden de
 *    inserción, sin que nadie lo hubiera decidido.
 *
 * Se unifica al criterio ponderado porque es el único que ordena de forma TOTAL: los pesos son
 * potencias de dos, de modo que cada dimensión pesa más que todas las de menor rango juntas
 * (sucursal 4 > categoría 2 + riesgo 1) y dos combinaciones distintas de dimensiones nunca empatan.
 * El orden de precedencia es, por tanto: sucursal, luego categoría de producto, luego segmento de
 * riesgo. Sólo dos reglas con EXACTAMENTE las mismas dimensiones siguen empatando, y eso ya no es
 * una cuestión de criterio sino de reglas duplicadas.
 *
 * Si algún día una dimensión debe pesar distinto, se cambia AQUÍ y las pruebas compartidas
 * (`mdr-specificity-contract.spec.ts`) dicen si cobro y pantalla siguen de acuerdo.
 */
export const MDR_DIMENSION_WEIGHT = {
  branch: 4,
  productCategory: 2,
  riskSegment: 1,
} as const;

/** Las tres dimensiones por las que se segmenta una regla; nulas o vacías = «cualquiera». */
export interface MdrRuleDimensions {
  branchId?: string | null;
  productCategory?: string | null;
  riskSegment?: string | null;
}

/** Peso de una regla: la suma de los pesos de las dimensiones que fija. Más alto gana. */
export function mdrRuleSpecificity(rule: MdrRuleDimensions): number {
  return (
    (rule.branchId ? MDR_DIMENSION_WEIGHT.branch : 0) +
    (rule.productCategory ? MDR_DIMENSION_WEIGHT.productCategory : 0) +
    (rule.riskSegment ? MDR_DIMENSION_WEIGHT.riskSegment : 0)
  );
}
