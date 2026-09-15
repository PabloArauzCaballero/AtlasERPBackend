import { defineDomain } from '../src/common/catalog/domain';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { ALL_DOMAINS } from '../src/modules/catalog/domains';

/**
 * Cada valor de cada dominio explica qué significa y cuándo elegirlo.
 *
 * El frontend pinta `help` como descripción de cada fila del select. Sin ella el formulario vuelve
 * a ser una lista de palabras sueltas —«Parcial», «OCI», «BDP»— donde quien lo llena elige por
 * intuición: exactamente el problema que el registro de dominios vino a resolver un nivel más
 * arriba (que las listas no se copiaran). Que `help` sea obligatoria por el TIPO impide que falte
 * en un valor nuevo; estas pruebas impiden lo que el tipo no puede ver: una ayuda que no ayuda
 * —la etiqueta repetida, dos palabras, un texto tan largo que no cabe en la fila—.
 *
 * El tope de 140 caracteres no es estético: el select pinta la descripción en una sola fila bajo
 * la etiqueta, y lo que pasa de ahí se corta sin avisar.
 */

const MIN_WORDS = 4;
const MAX_CHARACTERS = 140;

/** Sin tildes, sin mayúsculas y sin puntuación: así «Activo» y «activo.» son el mismo texto. */
const normalise = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const everyOption = ALL_DOMAINS.flatMap((domain) =>
  domain.options.map((option) => ({
    id: `${domain.name}.${option.code}`,
    label: option.label,
    help: option.help,
  })),
);

describe('ayuda de los dominios del catálogo', () => {
  it('hay dominios y valores que revisar (si esto falla, la lista se vació sola)', () => {
    expect(ALL_DOMAINS.length).toBeGreaterThanOrEqual(100);
    expect(everyOption.length).toBeGreaterThanOrEqual(519);
  });

  it.each(everyOption)('«$id» tiene una ayuda utilizable', ({ label, help }) => {
    expect(typeof help).toBe('string');
    expect(help.trim()).not.toBe('');
    expect(help.length).toBeLessThanOrEqual(MAX_CHARACTERS);
    expect(normalise(help).split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(MIN_WORDS);
    // No repite la etiqueta: si sólo la reescribe, la fila del select sigue sin decir nada.
    expect(normalise(help)).not.toBe(normalise(label));
  });

  it('`GET /catalog/domains` publica la ayuda de cada valor', () => {
    const { domains } = new CatalogService().list();
    const published = Object.values(domains).flat();
    expect(published).toHaveLength(everyOption.length);
    expect(published.every((option) => typeof option.help === 'string' && option.help !== '')).toBe(
      true,
    );
  });

  it('un valor sin ayuda no llega a construirse', () => {
    expect(() =>
      defineDomain('test.sinAyuda', 'Prueba.', [{ code: 'X', label: 'Equis', help: '   ' }]),
    ).toThrow(/no tiene ayuda/);
  });
});
