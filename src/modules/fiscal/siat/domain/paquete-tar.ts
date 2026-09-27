/**
 * Paquete de contingencia del SIN: un TAR (ustar) con UN XML por factura, comprimido con gzip.
 *
 * Un archivo por factura, no una concatenación: el SIN responde por factura con `numeroArchivo` y
 * valida `cantidadFacturas` (985). Escritor ustar mínimo, sin dependencias.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const BLOQUE = 512;

function octal(cabecera: Buffer, inicio: number, largo: number, valor: number): void {
  cabecera.write(valor.toString(8).padStart(largo - 1, '0') + '\0', inicio, largo, 'latin1');
}

function sumaDeControl(cabecera: Buffer): number {
  let suma = 0;
  for (let i = 0; i < BLOQUE; i += 1) suma += i >= 148 && i < 156 ? 0x20 : cabecera[i]!;
  return suma;
}

export interface ArchivoTar {
  nombre: string;
  contenido: Buffer | string;
}

export function escribirTar(archivos: readonly ArchivoTar[]): Buffer {
  const partes: Buffer[] = [];
  for (const { nombre, contenido } of archivos) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    if (Buffer.byteLength(nombre) > 100)
      throw new RangeError('Nombre de archivo tar demasiado largo.');
    const cabecera = Buffer.alloc(BLOQUE);
    cabecera.write(nombre, 0, 100, 'utf8');
    octal(cabecera, 100, 8, 0o644);
    octal(cabecera, 108, 8, 0);
    octal(cabecera, 116, 8, 0);
    octal(cabecera, 124, 12, datos.length);
    octal(cabecera, 136, 12, 0);
    cabecera.write('0', 156, 1, 'latin1');
    cabecera.write('ustar\0', 257, 6, 'latin1');
    cabecera.write('00', 263, 2, 'latin1');
    cabecera.write(sumaDeControl(cabecera).toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
    partes.push(cabecera, datos);
    const relleno = (BLOQUE - (datos.length % BLOQUE)) % BLOQUE;
    if (relleno) partes.push(Buffer.alloc(relleno));
  }
  partes.push(Buffer.alloc(BLOQUE * 2));
  return Buffer.concat(partes);
}

export interface ArchivoComprimido {
  gzip: Buffer;
  /** SHA-256 del gzip en hex minúsculas: el `hashArchivo` que pide el SIN. */
  sha256: string;
}

export function comprimir(contenido: Buffer | string): ArchivoComprimido {
  const gzip = gzipSync(Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8'));
  return { gzip, sha256: createHash('sha256').update(gzip).digest('hex') };
}

/** Paquete listo: tar de `<numeroFactura>.xml` por factura, en gzip, con su hash. */
export function empaquetarFacturas(
  facturas: readonly { numeroFactura: number | string; xml: string }[],
): ArchivoComprimido {
  return comprimir(
    escribirTar(facturas.map((f) => ({ nombre: `${f.numeroFactura}.xml`, contenido: f.xml }))),
  );
}
