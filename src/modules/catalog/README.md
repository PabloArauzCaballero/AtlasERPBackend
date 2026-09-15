# Catálogo de dominios cerrados

Un **dominio** es la lista de valores que admite un campo cerrado (estado, tipo, moneda de un
contrato, régimen tributario…), con la etiqueta que lee una persona. Se declara una sola vez aquí
y de aquí salen el `z.enum` del esquema, el select del frontend y la prueba que lo compara con la
base.

No es un dominio una lista de **filas** (cuentas contables, socios, oportunidades): esas crecen con
el uso y se leen de su propio endpoint.

## Leer un dominio

Cualquier usuario autenticado (interno o del comercio). Sin `@Roles`.

| Petición                                                     | Respuesta                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `GET /api/v1/catalog/domains`                                | `{ domains: { "<nombre>": [{ code, label, help? }] } }` con todos              |
| `GET /api/v1/catalog/domains?names=crm.riskTier,ads.surface` | lo mismo, sólo esos; un nombre desconocido es 400 `CATALOG_DOMAIN_NOT_FOUND`   |
| `GET /api/v1/catalog/domains/crm.riskTier`                   | `{ name, description, options: [{ code, label, help? }] }`; desconocido es 404 |

El `code` es lo que se guarda y se valida: estable e imprimible (nunca un UUID), así que una
persona puede escribirlo en papel. La `label` se puede retocar sin migrar nada. `help` es opcional.

## Añadir o cambiar un dominio

1. Declararlo en `domains/<modulo>.domains.ts` con `defineDomain(nombre, descripción, opciones,
respaldo)`. Si los códigos ya existen como array `as const` o `enum` en el módulo, usar
   `labelled(lista, etiquetas)`: TypeScript obliga a etiquetar cada valor.
2. Si la columna tiene CHECK o ENUM de Postgres, declararlo en `respaldo`
   (`[{ check: 'nombre_del_check' }]` o `[{ enumType: 'esquema.tipo' }]`). Cambiar valores exige
   migración que amplíe el CHECK antes de cualquier `UPDATE`.
3. En el esquema Zod, `zodEnum(dominio)` en vez de repetir la lista.
4. Añadirlo a la lista exportada al final del archivo.

`test/catalog-domains-contract.spec.ts` falla si un CHECK/ENUM no coincide con su dominio, si un
respaldo declarado no existe en las migraciones, o si un esquema de entrada usa un `z.enum` que no
está registrado.
