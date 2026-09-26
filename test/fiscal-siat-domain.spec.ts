import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calcularCuf, CufInputError, modulo11 } from '../src/modules/fiscal/siat/domain/cuf';
import type {
  CabeceraFactura,
  DetalleFactura,
} from '../src/modules/fiscal/siat/domain/factura-xml';
import {
  construirFacturaXml,
  FacturaXmlError,
} from '../src/modules/fiscal/siat/domain/factura-xml';
import { fechaDe, fechaHoraLocal } from '../src/modules/fiscal/siat/domain/fecha-local';
import { calcularTotales, MontosFiscalesError } from '../src/modules/fiscal/siat/domain/montos';
import { empaquetarFacturas } from '../src/modules/fiscal/siat/domain/paquete-tar';
import { accionPara } from '../src/modules/fiscal/siat/domain/siat-codes';

/**
 * El dominio fiscal contra la especificación publicada por el SIN: vectores oficiales del CUF, el
 * XSD de compra-venta y el XML de ejemplo. Se valida RECALCULANDO, nunca por longitud.
 */

const FIXTURES = join(__dirname, 'fixtures', 'siat');
const XSD = join(FIXTURES, 'facturaComputarizadaCompraVenta.xsd');

const baseCuf = {
  codigoSucursal: 0,
  codigoEmision: 1,
  tipoFacturaDocumento: 1,
  codigoDocumentoSector: 1,
  numeroFactura: 1,
  codigoPuntoVenta: 0,
};

describe('CUF', () => {
  it('reproduce los tres vectores oficiales del SIN', () => {
    expect(
      calcularCuf({
        ...baseCuf,
        nit: '123456789',
        fechaEmision: '2019-01-13T16:37:21.231',
        codigoModalidad: 1,
        codigoControl: 'A19E23EF34124CD',
      }),
    ).toBe('8727F63A15F8976591FDDE5B387C5D015A29E06A1A19E23EF34124CD');
    expect(
      calcularCuf({
        ...baseCuf,
        nit: '1003579028',
        fechaEmision: '2021-10-07T09:01:24.178',
        codigoModalidad: 1,
        codigoControl: '67A75AC82F24C74',
      }),
    ).toBe('44AAEC00DBD34C819B4D7AFD5F91900D3A059E06A467A75AC82F24C74');
    expect(
      calcularCuf({
        ...baseCuf,
        nit: '1003579028',
        fechaEmision: '2021-10-06T16:03:48.675',
        codigoModalidad: 2,
        codigoControl: '67A75AC82F24C74',
      }),
    ).toBe('44AAEC00DBD34C53C3E2CCE1A3FA7AF1E2A08606A667A75AC82F24C74');
  });

  it('el mismo documento fuera de línea tiene otro CUF', () => {
    const entrada = {
      ...baseCuf,
      nit: '1003579028',
      fechaEmision: '2021-10-06T16:03:48.675',
      codigoModalidad: 2,
      codigoControl: '67A75AC82F24C74',
    };
    expect(calcularCuf({ ...entrada, codigoEmision: 2 })).not.toBe(calcularCuf(entrada));
  });

  it('módulo 11: 10 → 1 y 11 nunca aparece', () => {
    expect(modulo11('0')).toBe('0');
    expect(modulo11('5')).toBe('1');
  });

  it('rechaza una fecha sin milisegundos o un NIT con letras', () => {
    const entrada = { ...baseCuf, codigoModalidad: 2, codigoControl: 'ABC' };
    expect(() =>
      calcularCuf({ ...entrada, nit: '1', fechaEmision: '2021-10-06T16:03:48' }),
    ).toThrow(CufInputError);
    expect(() =>
      calcularCuf({ ...entrada, nit: '12A', fechaEmision: '2021-10-06T16:03:48.675' }),
    ).toThrow(CufInputError);
  });
});

describe('fecha local', () => {
  it('usa la zona de la entidad, no la del servidor', () => {
    const instante = new Date('2026-09-27T01:00:00.123Z');
    expect(fechaHoraLocal(instante, 'America/La_Paz')).toBe('2026-09-26T21:00:00.123');
    expect(fechaDe(fechaHoraLocal(instante, 'America/La_Paz'))).toBe('2026-09-26');
  });
});

describe('montos del sector 1', () => {
  it('el ejemplo oficial: 1 × 100 con 1 de descuento adicional = 99', () => {
    const totales = calcularTotales([{ cantidad: '1', precioUnitario: '100' }], {
      descuentoAdicional: '1',
    });
    expect(totales.lineas[0]!.subTotal).toBe('100.00');
    expect(totales.montoTotal).toBe('99.00');
    expect(totales.montoTotalMinor).toBe(9900n);
  });

  it('redondea HALF_UP a céntimos: 3 × 0,335 no existe; 1,5 × 10,01 = 15,02', () => {
    expect(calcularTotales([{ cantidad: '1.5', precioUnitario: '10.01' }]).montoTotal).toBe(
      '15.02',
    );
  });

  it('una línea en cero o un total en cero no se emiten', () => {
    expect(() => calcularTotales([{ cantidad: '1', precioUnitario: '0' }])).toThrow(
      MontosFiscalesError,
    );
    expect(() =>
      calcularTotales([{ cantidad: '1', precioUnitario: '10' }], { descuentoAdicional: '10' }),
    ).toThrow(MontosFiscalesError);
    expect(() => calcularTotales([])).toThrow(MontosFiscalesError);
  });
});

function cabeceraOficial(overrides: Partial<CabeceraFactura> = {}): CabeceraFactura {
  return {
    nitEmisor: '1003579028',
    razonSocialEmisor: 'Carlos Loza',
    municipio: 'La Paz',
    telefono: '78595684',
    numeroFactura: 1,
    cuf: '44AAEC00DBD34C53C3E2CCE1A3FA7AF1E2A08606A667A75AC82F24C74',
    cufd: 'BQUE+QytqQUDBKVUFOSVRPQkxVRFZNVFVJBMDAwMDAwM',
    codigoSucursal: 0,
    direccion: 'AV. JORGE LOPEZ #123',
    codigoPuntoVenta: null,
    fechaEmision: '2021-10-06T16:03:48.675',
    nombreRazonSocial: 'Mi razon social',
    codigoTipoDocumentoIdentidad: 1,
    numeroDocumento: '5115889',
    complemento: null,
    codigoCliente: '51158891',
    codigoMetodoPago: 1,
    numeroTarjeta: null,
    montoTotal: '99',
    montoTotalSujetoIva: '99',
    codigoMoneda: 1,
    tipoCambio: '1',
    montoTotalMoneda: '99',
    montoGiftCard: null,
    descuentoAdicional: '1',
    codigoExcepcion: null,
    cafc: null,
    leyenda:
      'Ley N° 453: Tienes derecho a recibir información sobre las características y contenidos de los servicios que utilices.',
    usuario: 'pperez',
    codigoDocumentoSector: 1,
    ...overrides,
  };
}

const detalleOficial: DetalleFactura = {
  actividadEconomica: '451010',
  codigoProductoSin: 49111,
  codigoProducto: 'JN-131231',
  descripcion: 'JUGO DE NARANJA EN VASO',
  cantidad: '1',
  unidadMedida: 1,
  precioUnitario: '100',
  montoDescuento: '0',
  subTotal: '100',
  numeroSerie: '124548',
  numeroImei: '545454',
};

function validarContraXsd(xml: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'siat-xsd-'));
  const archivo = join(dir, 'factura.xml');
  writeFileSync(archivo, xml);
  // Sin xmllint esto lanza: una validación contra XSD que se salta en silencio no vale nada.
  execFileSync('xmllint', ['--noout', '--schema', XSD, archivo], { stdio: 'pipe' });
}

function valores(xml: string): string[] {
  return [...xml.matchAll(/<(\w+)(?: xsi:nil="true")?\/?>([^<]*)/g)]
    .filter(([, nombre]) => !['cabecera', 'detalle'].includes(nombre!))
    .map(([, nombre, valor]) => `${nombre}=${(valor ?? '').replace(/\s+/g, ' ').trim()}`);
}

describe('XML de la factura', () => {
  it('con los datos del ejemplo oficial, cada campo coincide con el XML del SIN y valida contra el XSD', () => {
    const xml = construirFacturaXml(2, cabeceraOficial(), [detalleOficial]);
    validarContraXsd(xml);
    const oficial = readFileSync(join(FIXTURES, 'facturaComputarizadaCompraVenta.xml'), 'utf8');
    expect(valores(xml)).toEqual(valores(oficial));
  });

  it('el XSD de verdad rechaza un XML al que le falta la leyenda', () => {
    const xml = construirFacturaXml(2, cabeceraOficial(), [detalleOficial]).replace(
      /\s*<leyenda>[^<]*<\/leyenda>/,
      '',
    );
    expect(() => validarContraXsd(xml)).toThrow();
  });

  it('escapa los caracteres de XML en la razón social', () => {
    const xml = construirFacturaXml(2, cabeceraOficial({ nombreRazonSocial: 'A & B <S.R.L.>' }), [
      detalleOficial,
    ]);
    expect(xml).toContain('<nombreRazonSocial>A &amp; B &lt;S.R.L.&gt;</nombreRazonSocial>');
    validarContraXsd(xml);
  });

  it('501 líneas no se construyen; 500 sí y validan', () => {
    expect(() =>
      construirFacturaXml(2, cabeceraOficial(), Array(501).fill(detalleOficial)),
    ).toThrow(FacturaXmlError);
    validarContraXsd(construirFacturaXml(2, cabeceraOficial(), Array(500).fill(detalleOficial)));
  });

  it('un texto más largo que el XSD falla antes de enviar', () => {
    expect(() =>
      construirFacturaXml(2, cabeceraOficial({ municipio: 'x'.repeat(26) }), [detalleOficial]),
    ).toThrow(FacturaXmlError);
  });

  it('la modalidad electrónica no se emite sin firma', () => {
    expect(() => construirFacturaXml(1, cabeceraOficial(), [detalleOficial])).toThrow(
      FacturaXmlError,
    );
  });

  it('complemento con un documento que no es CI se rechaza', () => {
    expect(() =>
      construirFacturaXml(
        2,
        cabeceraOficial({ complemento: '1A', codigoTipoDocumentoIdentidad: 5 }),
        [detalleOficial],
      ),
    ).toThrow(FacturaXmlError);
  });
});

describe('paquete de contingencia', () => {
  it('es un tar.gz con un XML por factura que lee el tar del sistema, y el hash es del gzip', () => {
    const paquete = empaquetarFacturas([
      { numeroFactura: 1, xml: '<a/>' },
      { numeroFactura: 2, xml: '<b/>' },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'siat-tar-'));
    const archivo = join(dir, 'paquete.tar.gz');
    writeFileSync(archivo, paquete.gzip);
    const listado = execFileSync('tar', ['-tzf', archivo]).toString().trim().split('\n');
    expect(listado).toEqual(['1.xml', '2.xml']);
    expect(paquete.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('códigos del SIN', () => {
  it('clasifica y deja lo desconocido como DESCONOCIDO, nunca como rechazo', () => {
    expect(accionPara(908)).toBe('ESTADO');
    expect(accionPara(952)).toBe('CONSULTAR');
    expect(accionPara(953)).toBe('RENOVAR_CREDENCIALES');
    expect(accionPara(1002)).toBe('DOCUMENTO');
    expect(accionPara(2000)).toBe('ADVERTENCIA');
    expect(accionPara(123456)).toBe('DESCONOCIDO');
  });
});
