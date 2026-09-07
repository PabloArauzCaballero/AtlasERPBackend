import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import type { ZodTypeAny } from 'zod';

/**
 * El CONTRATO de cada ruta, leído del `ZodValidationPipe` que ya la valida.
 *
 * Este bloque no publica OpenAPI, así que no hay documento del que derivar los campos que recibe
 * cada endpoint. Pero sí hay una fuente de verdad, y es mejor que un documento: el propio esquema
 * Zod que el pipe usa para aceptar o rechazar la petición. Si el catálogo lo describe mal, es
 * porque el validador también.
 *
 * Sin esto, ATLAS cataloga los 169 endpoints de este bloque sin un solo campo, y el generador de
 * datos de prueba de su laboratorio de QA no tiene de dónde derivar un payload: hay que escribirlo
 * a mano, que es exactamente lo que hace que nadie pruebe el caso inválido.
 *
 * El formato de salida es el abreviado que ATLAS ingiere: `{ campo: 'tipo|required' }`. Se describe
 * QUÉ campos entran y si son obligatorios, no se reproduce el validador — los rangos, los enums y
 * las expresiones regulares se quedan en el esquema, que es donde se aplican.
 */

export type ContractMap = Record<string, string>;

type ZodDefLike = {
  typeName?: string;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  type?: ZodTypeAny;
};

function defOf(schema: unknown): ZodDefLike | null {
  if (!schema || typeof schema !== 'object') return null;
  const def = (schema as { _def?: unknown })._def;
  return def && typeof def === 'object' ? (def as ZodDefLike) : null;
}

/**
 * Quita las envolturas que no cambian el TIPO del campo, sólo su obligatoriedad o su procedencia:
 * `.optional()`, `.nullable()`, `.default()`, `.catch()` y los `.refine()`/`.transform()` que Zod
 * representa como `ZodEffects`. Sin desenvolverlas, un `z.string().optional()` se cataloga con
 * tipo desconocido y el generador produce una cadena genérica donde debía ir un correo.
 */
function unwrap(schema: ZodTypeAny, depth = 0): ZodTypeAny {
  if (depth > 8) return schema;
  const def = defOf(schema);
  const inner =
    def?.innerType ?? def?.schema ?? (def?.typeName === 'ZodPipeline' ? def?.type : undefined);
  return inner ? unwrap(inner, depth + 1) : schema;
}

const TYPE_NAMES: Record<string, string> = {
  ZodString: 'string',
  ZodNumber: 'number',
  ZodBigInt: 'integer',
  ZodBoolean: 'boolean',
  ZodDate: 'string',
  ZodArray: 'array',
  ZodObject: 'object',
  ZodRecord: 'object',
  ZodMap: 'object',
  ZodEnum: 'string',
  ZodNativeEnum: 'string',
  ZodLiteral: 'string',
  ZodTuple: 'array',
  ZodSet: 'array',
};

function typeNameOf(schema: ZodTypeAny): string {
  const def = defOf(unwrap(schema));
  const name = def?.typeName ?? '';
  if (name === 'ZodUnion' || name === 'ZodDiscriminatedUnion') {
    // Una unión no tiene UN tipo. Declararlo como el de la primera rama sería una afirmación
    // arbitraria, y el generador produciría valores que la mitad de las ramas rechaza.
    return 'unknown';
  }
  return TYPE_NAMES[name] ?? 'unknown';
}

function isOptional(schema: ZodTypeAny): boolean {
  const candidate = schema as { isOptional?: () => boolean };
  if (typeof candidate.isOptional === 'function') {
    try {
      return candidate.isOptional();
    } catch {
      // Un esquema con `.refine()` puede lanzar al preguntarle. Ante la duda se declara
      // obligatorio: catalogar como opcional un campo que el validador exige haría que el
      // generador produjera casos «válidos» que el endpoint rechaza.
      return false;
    }
  }
  return false;
}

/** Convierte un `z.object({...})` en el mapa abreviado. Cualquier otra forma no aporta campos. */
export function contractFromZod(schema: unknown): ContractMap {
  const unwrapped = unwrap(schema as ZodTypeAny);
  const def = defOf(unwrapped);
  if (def?.typeName !== 'ZodObject') return {};

  const shapeFactory = (unwrapped as unknown as { shape?: unknown }).shape;
  const shape =
    typeof shapeFactory === 'function' ? (shapeFactory as () => unknown)() : shapeFactory;
  if (!shape || typeof shape !== 'object') return {};

  const contract: ContractMap = {};
  for (const [name, field] of Object.entries(shape as Record<string, ZodTypeAny>)) {
    contract[name] = `${typeNameOf(field)}|${isOptional(field) ? 'optional' : 'required'}`;
  }
  return contract;
}

type RouteArg = { index: number; pipes?: unknown[] };

/**
 * Los esquemas Zod que un handler declara, por origen del dato.
 *
 * Nest guarda los parámetros del handler en `ROUTE_ARGS_METADATA` con la clave
 * `"<paramtype>:<index>"`, y ahí viajan los pipes de la instancia — incluido el
 * `ZodValidationPipe` con su esquema dentro. Es reflexión sobre un detalle interno de Nest, sí, y
 * por eso todo está acotado con guardas: si la forma cambia, este catálogo publica endpoints sin
 * contrato, que es lo que publicaba antes. Nunca rompe una ruta.
 */
export function contractsOfHandler(
  handler: object,
  controller: object,
): {
  body: ContractMap;
  query: ContractMap;
  path: ContractMap;
} {
  const empty = { body: {}, query: {}, path: {} };
  /*
   * Nest guarda estos metadatos en la CLASE del controlador, no en su prototipo. Quien llama puede
   * tener a mano cualquiera de los dos —el inventario de rutas recorre clases; una prueba es más
   * cómoda con el prototipo— así que se admiten ambos y se resuelve aquí. Mirar
   * `controller.constructor` sin distinguir devolvía `Function` cuando llegaba la clase, y entonces
   * NO había metadatos: el manifiesto salía sin un solo contrato y nada lo delataba.
   */
  const target = typeof controller === 'function' ? controller : controller.constructor;
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    target,
    (handler as { name?: string }).name ?? '',
  ) as Record<string, RouteArg> | undefined;
  if (!metadata) return empty;

  const result = { body: {} as ContractMap, query: {} as ContractMap, path: {} as ContractMap };
  for (const [key, arg] of Object.entries(metadata)) {
    const paramType = Number(key.split(':')[0]);
    const origin =
      paramType === RouteParamtypes.BODY
        ? 'body'
        : paramType === RouteParamtypes.QUERY
          ? 'query'
          : paramType === RouteParamtypes.PARAM
            ? 'path'
            : null;
    if (!origin) continue;

    for (const pipe of arg.pipes ?? []) {
      const schema = (pipe as { schema?: unknown })?.schema;
      if (!schema) continue;
      Object.assign(result[origin], contractFromZod(schema));
    }
  }
  return result;
}
