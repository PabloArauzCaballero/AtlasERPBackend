/**
 * El total en letras que exige la representación gráfica: «Son: Ciento setenta 50/100 Bolivianos».
 * Enteros hasta 999.999.999.999; los céntimos van en fracción, como en las facturas bolivianas.
 */

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];
const DECENAS = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
];
const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

function hastaMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  let texto = CENTENAS[centena]!;
  if (resto > 0) {
    const decenas =
      resto < 30
        ? UNIDADES[resto]!
        : `${DECENAS[Math.floor(resto / 10)]}${resto % 10 ? ` y ${UNIDADES[resto % 10]}` : ''}`;
    texto = texto ? `${texto} ${decenas}` : decenas;
  }
  return texto;
}

/** «uno» se apocopa a «un» delante de mil/millón. */
const apocope = (texto: string) =>
  texto.replace(/(^|\s)uno$/, '$1un').replace(/veintiuno$/, 'veintiún');

export function enteroEnLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) {
    throw new RangeError('Importe fuera del rango que se escribe en letras.');
  }
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? 'un millón' : `${apocope(enteroEnLetras(millones))} millones`);
  }
  if (miles > 0) partes.push(miles === 1 ? 'mil' : `${apocope(hastaMil(miles))} mil`);
  if (resto > 0) partes.push(hastaMil(resto));
  return partes.join(' ');
}

/** `'170.50'` → `'Son: Ciento setenta 50/100 Bolivianos'`. */
export function montoLiteral(monto: string, moneda = 'Bolivianos'): string {
  const [entero = '0', decimales = ''] = monto.split('.');
  const letras = enteroEnLetras(Number(entero));
  return `Son: ${letras.charAt(0).toUpperCase()}${letras.slice(1)} ${decimales.padEnd(2, '0').slice(0, 2)}/100 ${moneda}`;
}
