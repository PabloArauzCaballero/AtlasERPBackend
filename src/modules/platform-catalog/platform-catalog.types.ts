/**
 * Contrato del MANIFIESTO DE CATÁLOGO que este backend publica sobre sí mismo.
 *
 * ## Por qué el ERP describe su propio catálogo
 *
 * El portal interno de ATLAS muestra UN catálogo de datos y UN inventario de endpoints para todo
 * el ecosistema. Hasta ahora sólo contenía Atlas Backend, porque era el único capaz de
 * introspeccionarse: miraba su propio `information_schema` y su propio router. El ERP quedaba
 * fuera —igual que el motor de decisión— y un operador que abría el catálogo veía un ecosistema
 * que parecía tener un solo producto.
 *
 * Rellenar ese hueco desde fuera exigiría que Atlas Backend abriera la base del ERP, que es
 * justo el acoplamiento que estos dos productos evitan a propósito: tienen bases separadas y
 * ninguna llamada de negocio entre ellos. Publicar el manifiesto invierte la dirección — el ERP
 * cuenta lo suyo, en runtime y sin ceder acceso a nada.
 *
 * ## Por qué la forma es idéntica en los tres bloques
 *
 * Atlas Backend guarda los tres en las mismas tablas de catálogo, con una columna de bloque. Un
 * dialecto por servicio obligaría a un traductor por servicio y el catálogo dejaría de ser
 * comparable: «contiene PII» significaría una cosa aquí y otra allá.
 */

export interface CatalogManifestBlock {
  code: string;
  name: string;
  repository: string;
  service: string;
  version: string;
  commit: string;
  routePrefix: string;
  generatedAt: string;
}

export interface CatalogManifestEndpoint {
  code: string;
  module: string;
  method: string;
  fullPath: string;
  controllerName: string | null;
  handlerName: string | null;
  summary: string;
  requiresAuth: boolean;
  allowedRoles: string[];
  audience: string | null;
  isReadonly: boolean;
  isDestructive: boolean;
  riskLevel: string;
  /**
   * El CONTRATO de entrada, en el formato abreviado que ATLAS ingiere: `{ campo: 'tipo|required' }`.
   *
   * Opcional porque una ruta puede no validar con Zod. Sin él, ATLAS cataloga el endpoint sin un
   * solo campo y el generador de datos de prueba de su laboratorio de QA no tiene de dónde derivar
   * un payload — hay que escribirlo a mano, que es lo que hace que nadie pruebe el caso inválido.
   */
  minPayloadSchema?: Record<string, string>;
  queryParamsSchema?: Record<string, string>;
  pathParamsSchema?: Record<string, string>;
}

export interface CatalogManifestDataEntity {
  schemaName: string;
  tableName: string;
  entityName: string;
  module: string;
  columnCount: number;
  primaryKeyColumns: string[];
  containsPii: boolean;
  containsFinancialData: boolean;
  containsRiskData: boolean;
  isAuditCritical: boolean;
  businessPurpose: string;
}

export interface CatalogManifest {
  block: CatalogManifestBlock;
  endpoints: CatalogManifestEndpoint[];
  dataEntities: CatalogManifestDataEntity[];
}
