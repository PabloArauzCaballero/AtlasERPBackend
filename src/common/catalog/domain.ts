import { z } from 'zod';

/**
 * Un dominio cerrado: la lista de valores que un campo admite, declarada UNA sola vez.
 *
 * ## Por qué existe
 *
 * Hasta el 2026-09-15 cada enum del ERP vivía en hasta cuatro copias que nadie sincronizaba: el
 * array o `enum` de TypeScript, el `z.enum` del esquema, el `CHECK` de la tabla y las `options`
 * que el frontend escribía a mano en cada pantalla. El resultado estaba a la vista:
 *
 * - `gl_account.status`: Zod aceptaba `ARCHIVED` y el CHECK no, así que archivar una cuenta
 *   devolvía un 500 «error de base de datos» sin decir qué campo.
 * - El frontend pintaba como texto libre campos que el backend rechaza fuera del enum, y el alta
 *   fallaba hasta que alguien adivinaba la palabra exacta.
 * - Dos pantallas ofrecían dos listas distintas para el mismo `opportunityType`.
 *
 * Un dominio declara el código (lo que se guarda y lo que valida el esquema) y la etiqueta (lo que
 * lee una persona). El frontend lo pide por `GET /catalog/domains` en vez de copiarlo, el esquema
 * Zod lo usa con `zodEnum()`, y una prueba de contrato compara cada dominio con el CHECK o el
 * ENUM de Postgres que lo respalda.
 *
 * ## Qué NO es un dominio
 *
 * Una lista de FILAS (cuentas contables, socios, oportunidades) no es un dominio: crece con el uso
 * y se lee de su propio endpoint. Un dominio es vocabulario: cambia sólo cuando cambia el código.
 */
export interface DomainOption<C extends string = string> {
  /** Lo que se guarda y valida. Estable e imprimible: una persona puede escribirlo en papel. */
  readonly code: C;
  /** Lo que se muestra. Se puede retocar sin migrar nada. */
  readonly label: string;
  /**
   * Qué significa esa opción y cuándo elegirla. OBLIGATORIA.
   *
   * El frontend la pinta como descripción de cada fila del select, así que una etiqueta suelta
   * («Parcial», «OCI», «BDP») deja a quien llena el formulario adivinando. Es obligatoria por el
   * tipo y no por convención: el día que se añada un valor sin explicarlo, esto deja de compilar
   * en vez de llegar a la pantalla como una fila muda. No repite la etiqueta: la explica.
   */
  readonly help: string;
}

/**
 * Qué objeto de la base respalda el dominio. La prueba de contrato lo lee de las migraciones SQL y
 * exige que tenga exactamente los mismos valores: es la comprobación que habría cazado el 500 de
 * `gl_account.status`.
 */
export type DomainDatabaseBinding = { readonly check: string } | { readonly enumType: string };

export interface DomainDefinition<C extends string = string> {
  /** `modulo.nombreEnCamelCase`, p. ej. `accounting.glAccountType`. */
  readonly name: string;
  readonly description: string;
  readonly options: readonly DomainOption<C>[];
  /** Los códigos en el orden declarado. Nunca vacío. */
  readonly codes: readonly [C, ...C[]];
  readonly database: readonly DomainDatabaseBinding[];
}

const DOMAIN_NAME = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z0-9]*$/;
const DOMAIN_CODE = /^[A-Za-z0-9_./-]+( [A-Za-z0-9_./-]+)*$/;

export function defineDomain<const C extends string>(
  name: string,
  description: string,
  options: readonly DomainOption<C>[],
  database: readonly DomainDatabaseBinding[] = [],
): DomainDefinition<C> {
  if (!DOMAIN_NAME.test(name)) {
    throw new Error(`Nombre de dominio inválido: «${name}». Debe ser modulo.nombre.`);
  }
  if (options.length === 0) {
    throw new Error(`El dominio «${name}» no tiene valores.`);
  }
  const seen = new Set<string>();
  for (const option of options) {
    if (option.code.length > 60 || !DOMAIN_CODE.test(option.code)) {
      throw new Error(`Código inválido en «${name}»: «${option.code}».`);
    }
    if (seen.has(option.code)) {
      throw new Error(`Código repetido en «${name}»: «${option.code}».`);
    }
    if (!option.label.trim()) {
      throw new Error(`El código «${option.code}» de «${name}» no tiene etiqueta.`);
    }
    if (!option.help.trim()) {
      throw new Error(`El código «${option.code}» de «${name}» no tiene ayuda.`);
    }
    seen.add(option.code);
  }
  const codes = options.map((option) => option.code) as unknown as readonly [C, ...C[]];
  return Object.freeze({ name, description, options, codes, database });
}

/**
 * Construye las opciones de un dominio a partir de una lista de códigos que ya existe en el
 * código (un array `as const` o los valores de un `enum`), poniéndole la etiqueta y la ayuda a
 * cada uno.
 *
 * Así el dominio no REESCRIBE la lista —sigue mandando la del módulo— y TypeScript obliga a
 * describir todos los valores: si alguien añade uno al array, esto deja de compilar hasta que se le
 * ponga nombre Y explicación. La forma corta (sólo la cadena de la etiqueta) se retiró el
 * 2026-09-15 justamente porque dejaba escribir un valor sin ayuda sin que nada lo notara.
 */
export function labelled<const C extends string>(
  codes: readonly C[],
  labels: { readonly [K in C]: { readonly label: string; readonly help: string } },
): DomainOption<C>[] {
  return codes.map((code) => {
    const entry = labels[code];
    return { code, label: entry.label, help: entry.help };
  });
}

/** El `z.enum` del dominio, para usarlo en un esquema sin repetir la lista. */
export function zodEnum<C extends string>(domain: DomainDefinition<C>): z.ZodEnum<[C, ...C[]]> {
  return z.enum(domain.codes as [C, ...C[]]);
}
