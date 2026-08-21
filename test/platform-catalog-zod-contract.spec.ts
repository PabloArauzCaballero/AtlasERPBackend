import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { contractFromZod, contractsOfHandler } from '../src/modules/platform-catalog/zod-contract.util';

/**
 * El manifiesto de bloque publica el CONTRATO de cada endpoint leyéndolo del `ZodValidationPipe`
 * que ya valida la ruta. Este bloque no tiene OpenAPI, así que ése es el único sitio donde vive lo
 * que un endpoint acepta de verdad.
 *
 * Sin esto, ATLAS cataloga los 169 endpoints de este bloque sin un solo campo y el generador de
 * datos de prueba de su laboratorio de QA no tiene de dónde derivar un payload.
 */

describe('contractFromZod', () => {
  it('traduce un objeto a campos con tipo y obligatoriedad', () => {
    const schema = z.object({
      amount: z.number(),
      currency: z.string(),
      note: z.string().optional(),
    });

    expect(contractFromZod(schema)).toEqual({
      amount: 'number|required',
      currency: 'string|required',
      note: 'string|optional',
    });
  });

  /**
   * `.optional()`, `.default()` y `.nullable()` cambian la obligatoriedad, no el TIPO. Sin
   * desenvolverlas, el campo se cataloga como desconocido y el generador produce una cadena
   * genérica donde debía ir un número.
   */
  it('atraviesa optional, default y nullable sin perder el tipo', () => {
    const schema = z.object({
      page: z.number().default(1),
      search: z.string().nullable(),
      limit: z.number().optional(),
    });

    expect(contractFromZod(schema)).toEqual({
      page: 'number|optional',
      search: 'string|required',
      limit: 'number|optional',
    });
  });

  it('reconoce arrays, booleanos, enums y objetos anidados', () => {
    const schema = z.object({
      lines: z.array(z.object({ code: z.string() })),
      posted: z.boolean(),
      status: z.enum(['DRAFT', 'POSTED']),
      metadata: z.record(z.string(), z.unknown()),
    });

    expect(contractFromZod(schema)).toEqual({
      lines: 'array|required',
      posted: 'boolean|required',
      status: 'string|required',
      metadata: 'object|required',
    });
  });

  /**
   * Una unión no tiene UN tipo; declarar el de la primera rama sería arbitrario y el generador
   * produciría valores que la otra mitad rechaza.
   */
  it('una unión se declara de tipo desconocido en vez de elegir una rama', () => {
    const schema = z.object({ target: z.union([z.string(), z.number()]) });

    expect(contractFromZod(schema).target).toBe('unknown|required');
  });

  it('lo que no es un objeto no aporta campos', () => {
    expect(contractFromZod(z.string())).toEqual({});
    expect(contractFromZod(undefined)).toEqual({});
    expect(contractFromZod(null)).toEqual({});
  });
});

const bodySchema = z.object({ amount: z.number(), reference: z.string() });
const querySchema = z.object({ page: z.number().optional() });
const paramSchema = z.object({ id: z.string() });

@Controller('receipts')
class ProbeController {
  @Post()
  record(
    @Body(new ZodValidationPipe(bodySchema)) _body: unknown,
    @Query(new ZodValidationPipe(querySchema)) _query: unknown,
  ): void {}

  @Get(':id')
  find(@Param(new ZodValidationPipe(paramSchema)) _params: unknown): void {}

  @Get()
  list(): void {}
}

describe('contractsOfHandler', () => {
  const controller = ProbeController.prototype as object;
  const handler = (name: string): object =>
    (controller as Record<string, unknown>)[name] as object;

  it('separa el contrato por origen del dato', () => {
    const contracts = contractsOfHandler(handler('record'), controller);

    expect(contracts.body).toEqual({ amount: 'number|required', reference: 'string|required' });
    expect(contracts.query).toEqual({ page: 'number|optional' });
    expect(contracts.path).toEqual({});
  });

  it('lee también los parámetros de ruta', () => {
    const contracts = contractsOfHandler(handler('find'), controller);

    expect(contracts.path).toEqual({ id: 'string|required' });
    expect(contracts.body).toEqual({});
  });

  /**
   * El inventario de rutas recorre CLASES (`wrapper.metatype`), no prototipos. Buscar los metadatos
   * en `controller.constructor` sin distinguir devolvía `Function` cuando llegaba la clase, así que
   * el manifiesto salía sin un solo contrato —y nada lo delataba: 169 endpoints correctos y vacíos.
   */
  it('encuentra los metadatos tanto por la clase como por el prototipo', () => {
    const porClase = contractsOfHandler(handler('record'), ProbeController);
    const porPrototipo = contractsOfHandler(handler('record'), controller);

    expect(porClase).toEqual(porPrototipo);
    expect(porClase.body).toEqual({ amount: 'number|required', reference: 'string|required' });
  });

  /**
   * Una ruta sin validación no produce contrato. Publicar `{}` diría «no recibe nada» con la misma
   * forma con la que una ruta sin Zod diría «no lo sé»: son cosas distintas.
   */
  it('una ruta sin pipes no inventa contrato', () => {
    expect(contractsOfHandler(handler('list'), controller)).toEqual({ body: {}, query: {}, path: {} });
  });
});
