/**
 * Inventario de rutas leído del ROUTER VIVO de Nest, no de un fichero mantenido a mano.
 *
 * Nest ya sabe qué rutas sirve este proceso porque las montó. Recorrer sus controladores con
 * `DiscoveryService` y leer los mismos metadatos que leen los guards (`PATH_METADATA`,
 * `METHOD_METADATA`, `roles`, `isPublic`) devuelve el inventario REAL: un endpoint nuevo aparece
 * en el catálogo del portal en cuanto se despliega y uno retirado desaparece solo. Un inventario
 * que hay que acordarse de actualizar es el que miente el día que alguien lo consulta en serio.
 */
import { Injectable } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { CatalogManifestEndpoint } from './platform-catalog.types';
import { contractsOfHandler } from './zod-contract.util';

const READONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class RouteInventoryService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  collect(routePrefix: string, blockPrefix: string): CatalogManifestEndpoint[] {
    const endpoints: CatalogManifestEndpoint[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | undefined;
      if (!controller?.prototype) continue;

      const controllerPath = normalize(Reflect.getMetadata(PATH_METADATA, controller));
      const moduleName = moduleNameOf(controller.name);

      for (const methodName of this.scanner.getAllMethodNames(controller.prototype)) {
        const prototype = controller.prototype as Record<string, unknown>;
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;

        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (verb === undefined) continue;

        const method = verbName(verb);
        const fullPath = joinPath(
          routePrefix,
          controllerPath,
          normalize(Reflect.getMetadata(PATH_METADATA, handler)),
        );
        // Handler primero, clase después: el mismo orden de resolución que usa `RolesGuard`.
        // Al revés, una ruta que restringe más que su controlador se catalogaría como si
        // restringiera menos, que es la dirección peligrosa del error.
        const roles = metadataOf<string[]>(ROLES_KEY, handler, controller) ?? [];
        const isPublic = metadataOf<boolean>(IS_PUBLIC_KEY, handler, controller) === true;

        endpoints.push({
          code: codeFor(blockPrefix, method, fullPath),
          module: moduleName,
          method,
          fullPath,
          controllerName: controller.name,
          handlerName: methodName,
          summary: `${method} ${fullPath}`,
          requiresAuth: !isPublic,
          allowedRoles: roles,
          audience: null,
          isReadonly: READONLY_METHODS.has(method),
          isDestructive: method === 'DELETE',
          riskLevel: riskLevelOf(method, isPublic),
          // El contrato sale del `ZodValidationPipe` que ya valida la ruta: no hay documento
          // OpenAPI en este bloque, pero sí el esquema real que acepta o rechaza la petición.
          ...contractFieldsOf(handler, controller),
        });
      }
    }

    return endpoints.sort((left, right) => left.code.localeCompare(right.code));
  }
}

/**
 * Sólo se publican los mapas que tienen algo. Un `minPayloadSchema: {}` en cada GET diría «este
 * endpoint no recibe nada» con la misma forma con la que un POST sin Zod diría «no lo sé»: son
 * cosas distintas y el catálogo debe poder distinguirlas.
 */
function contractFieldsOf(handler: object, controller: object): Partial<CatalogManifestEndpoint> {
  const contracts = contractsOfHandler(handler, controller);
  return {
    ...(Object.keys(contracts.body).length ? { minPayloadSchema: contracts.body } : {}),
    ...(Object.keys(contracts.query).length ? { queryParamsSchema: contracts.query } : {}),
    ...(Object.keys(contracts.path).length ? { pathParamsSchema: contracts.path } : {}),
  };
}

function metadataOf<T>(key: string, handler: object, controller: object): T | undefined {
  const own = Reflect.getMetadata(key, handler) as T | undefined;
  return own !== undefined ? own : (Reflect.getMetadata(key, controller) as T | undefined);
}

/**
 * Riesgo por FORMA de la ruta, no por su nombre. Una ruta pública que muta es lo más expuesto
 * que existe: no hay identidad detrás del cambio. Es una heurística declarada como tal; el
 * catálogo la guarda como inferida y el portal deja revisarla a mano.
 */
function riskLevelOf(method: string, isPublic: boolean): string {
  if (READONLY_METHODS.has(method)) return 'LOW';
  return isPublic ? 'HIGH' : 'MEDIUM';
}

function codeFor(blockPrefix: string, method: string, fullPath: string): string {
  const slug = fullPath
    .replace(/[:{}]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `${blockPrefix}_${method}_${slug || 'ROOT'}`.slice(0, 180);
}

function moduleNameOf(controllerName: string): string {
  return (
    controllerName
      .replace(/Controller$/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase() || 'root'
  );
}

function verbName(verb: number): string {
  const name = (RequestMethod as Record<number, string | undefined>)[verb];
  return name && name !== 'ALL' ? name : 'GET';
}

function normalize(value: unknown): string {
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' ? first : '';
  }
  return typeof value === 'string' ? value : '';
}

function joinPath(...segments: string[]): string {
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${path}`;
}
