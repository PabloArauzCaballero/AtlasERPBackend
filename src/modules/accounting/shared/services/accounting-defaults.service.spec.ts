import { BadRequestException } from '@nestjs/common';
import { AccountingDefaultsService } from './accounting-defaults.service';

/**
 * Lo que el sistema deduce en lugar de preguntarlo.
 *
 * Tres casos por regla —el que resuelve, el del borde y el que NO debe resolver—, porque el fallo
 * caro aquí no es el error: es que el servicio elija «uno cualquiera» y produzca un asiento que
 * cuadra y miente. Por eso cada caso de error comprueba que se niega a elegir.
 */

const registro = <T>(filas: T[]) => ({
  findAll: jest.fn().mockResolvedValue(filas),
  findOne: jest.fn().mockResolvedValue(filas[0] ?? null),
  findByPk: jest.fn().mockResolvedValue(filas[0] ?? null),
});

const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

interface Dobles {
  /** Lo que devuelve la consulta del histórico de cuentas al debe de facturas AR. */
  historicoAr?: Array<{ gl_account_id: string }>;
  ledgers?: unknown[];
  aniosFiscales?: unknown[];
  periodos?: unknown[];
  cuentasDePartner?: unknown[];
  codigosTributarios?: unknown[];
  cuentasBancarias?: unknown[];
}

function crear(dobles: Dobles = {}) {
  const sequelize = { query: jest.fn().mockResolvedValue(dobles.historicoAr ?? []) };
  return new AccountingDefaultsService(
    sequelize as never,
    logger as never,
    registro(dobles.ledgers ?? []) as never,
    registro(dobles.aniosFiscales ?? []) as never,
    registro(dobles.periodos ?? []) as never,
    registro(dobles.cuentasDePartner ?? []) as never,
    registro(dobles.codigosTributarios ?? []) as never,
    registro(dobles.cuentasBancarias ?? []) as never,
  );
}

const LIBRO_PRINCIPAL = '10000000-0000-4000-8000-000000000001';
const LIBRO_NIIF = '10000000-0000-4000-8000-000000000002';
const PERIODO = '20000000-0000-4000-8000-000000000001';
const EMPRESA = '30000000-0000-4000-8000-000000000001';
const SOCIO = '40000000-0000-4000-8000-000000000001';
const CUENTA = '50000000-0000-4000-8000-000000000001';

describe('AccountingDefaultsService', () => {
  describe('el libro contable de la empresa', () => {
    it('caso válido: toma el marcado por defecto aunque haya varios activos', async () => {
      const servicio = crear({
        ledgers: [
          { id: LIBRO_NIIF, isDefault: false, status: 'ACTIVE' },
          { id: LIBRO_PRINCIPAL, isDefault: true, status: 'ACTIVE' },
        ],
      });
      await expect(servicio.resolveLedgerId(EMPRESA, undefined)).resolves.toBe(LIBRO_PRINCIPAL);
    });

    it('caso límite: con UNO solo activo y sin marcar, ése es', async () => {
      const servicio = crear({ ledgers: [{ id: LIBRO_NIIF, isDefault: false, status: 'ACTIVE' }] });
      await expect(servicio.resolveLedgerId(EMPRESA, undefined)).resolves.toBe(LIBRO_NIIF);
    });

    it('caso error: con dos activos y ninguno marcado NO elige, y dice qué hacer', async () => {
      const servicio = crear({
        ledgers: [
          { id: LIBRO_NIIF, isDefault: false, status: 'ACTIVE' },
          { id: LIBRO_PRINCIPAL, isDefault: false, status: 'ACTIVE' },
        ],
      });
      await expect(servicio.resolveLedgerId(EMPRESA, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(servicio.resolveLedgerId(EMPRESA, undefined)).rejects.toMatchObject({
        response: { code: 'LEDGER_NOT_RESOLVED' },
      });
    });

    it('lo explícito manda: no consulta nada', async () => {
      const servicio = crear({ ledgers: [] });
      await expect(servicio.resolveLedgerId(EMPRESA, LIBRO_NIIF)).resolves.toBe(LIBRO_NIIF);
    });
  });

  describe('el período contable de la fecha', () => {
    const abierto = {
      id: PERIODO,
      isOpen: true,
      closeStatus: 'OPEN',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };

    it('caso válido: el período abierto que cubre la fecha', async () => {
      const servicio = crear({ aniosFiscales: [{ id: 'anio' }], periodos: [abierto] });
      await expect(
        servicio.resolveOpenPeriodId(EMPRESA, new Date('2026-09-19T00:00:00Z'), undefined),
      ).resolves.toBe(PERIODO);
    });

    it('caso límite: el último día del período sigue cayendo dentro', async () => {
      const servicio = crear({ aniosFiscales: [{ id: 'anio' }], periodos: [abierto] });
      await expect(servicio.resolveOpenPeriodId(EMPRESA, '2026-09-30', undefined)).resolves.toBe(
        PERIODO,
      );
    });

    it('caso error: si el período de esa fecha está CERRADO, se niega en vez de usar otro', async () => {
      const servicio = crear({
        aniosFiscales: [{ id: 'anio' }],
        periodos: [{ ...abierto, isOpen: false, closeStatus: 'CLOSED' }],
      });
      await expect(
        servicio.resolveOpenPeriodId(EMPRESA, '2026-09-19', undefined),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNTING_PERIOD_NOT_RESOLVED' } });
    });

    it('caso error: sin ejercicio fiscal lo dice, en vez de fallar con un uuid vacío', async () => {
      const servicio = crear({ aniosFiscales: [] });
      await expect(
        servicio.resolveOpenPeriodId(EMPRESA, '2026-09-19', undefined),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNTING_PERIOD_NOT_RESOLVED' } });
    });
  });

  describe('la cuenta contable del socio', () => {
    it('caso válido: la que tiene asignada para ese propósito', async () => {
      const servicio = crear({ cuentasDePartner: [{ glAccountId: CUENTA }] });
      await expect(servicio.resolvePartnerAccountId(SOCIO, 'AR_CONTROL', undefined)).resolves.toBe(
        CUENTA,
      );
    });

    it('caso límite: el hueco existe pero está VACÍO, que no es lo mismo que tenerla', async () => {
      const servicio = crear({ cuentasDePartner: [{ glAccountId: null }] });
      await expect(
        servicio.resolvePartnerAccountId(SOCIO, 'AR_CONTROL', undefined),
      ).rejects.toMatchObject({ response: { code: 'PARTNER_DEFAULT_ACCOUNT_NOT_SET' } });
    });

    it('caso error: sin ficha de cuentas, el mensaje dice dónde asignarla', async () => {
      const servicio = crear({ cuentasDePartner: [] });
      await expect(
        servicio.resolvePartnerAccountId(SOCIO, 'AR_CONTROL', undefined),
      ).rejects.toThrow(/Cuentas por defecto/);
    });
  });

  describe('la cuenta de control AR, con el histórico como último recurso', () => {
    it('caso válido: la de la ficha del socio manda sobre el histórico', async () => {
      const servicio = crear({
        cuentasDePartner: [{ glAccountId: CUENTA }],
        historicoAr: [{ gl_account_id: 'otra' }],
      });
      await expect(servicio.resolveArControlAccountId(EMPRESA, SOCIO, undefined)).resolves.toBe(
        CUENTA,
      );
    });

    it('caso límite: sin ficha, la ÚNICA cuenta que esa empresa ya venía usando', async () => {
      const servicio = crear({ cuentasDePartner: [], historicoAr: [{ gl_account_id: CUENTA }] });
      await expect(servicio.resolveArControlAccountId(EMPRESA, SOCIO, undefined)).resolves.toBe(
        CUENTA,
      );
    });

    it('caso error: con dos cuentas en el histórico hay una decisión que tomar, y no la toma', async () => {
      const servicio = crear({
        cuentasDePartner: [],
        historicoAr: [{ gl_account_id: 'una' }, { gl_account_id: 'otra' }],
      });
      await expect(
        servicio.resolveArControlAccountId(EMPRESA, SOCIO, undefined),
      ).rejects.toMatchObject({ response: { code: 'PARTNER_DEFAULT_ACCOUNT_NOT_SET' } });
    });

    it('caso error: sin ficha y sin histórico, tampoco inventa', async () => {
      const servicio = crear({ cuentasDePartner: [], historicoAr: [] });
      await expect(servicio.resolveArControlAccountId(EMPRESA, SOCIO, undefined)).rejects.toThrow(
        /Cuentas por defecto/,
      );
    });
  });

  describe('el impuesto de una venta', () => {
    const iva = {
      id: 'iva',
      taxType: 'IVA',
      outputGlAccountId: CUENTA,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      status: 'ACTIVE',
    };

    it('caso válido: el código vigente trae su propia cuenta de pasivo', async () => {
      const servicio = crear({ codigosTributarios: [iva] });
      await expect(servicio.resolveOutputTax('2026-09-19', undefined, undefined)).resolves.toEqual({
        taxCodeId: 'iva',
        taxLiabilityAccountId: CUENTA,
      });
    });

    it('caso límite: con los dos datos explícitos no consulta nada', async () => {
      const servicio = crear({ codigosTributarios: [] });
      await expect(servicio.resolveOutputTax('2026-09-19', 'otro', 'cuenta')).resolves.toEqual({
        taxCodeId: 'otro',
        taxLiabilityAccountId: 'cuenta',
      });
    });

    it('caso error: un código vigente SIN cuenta de impuesto no sirve', async () => {
      const servicio = crear({ codigosTributarios: [{ ...iva, outputGlAccountId: null }] });
      await expect(
        servicio.resolveOutputTax('2026-09-19', undefined, undefined),
      ).rejects.toMatchObject({ response: { code: 'TAX_CODE_NOT_RESOLVED' } });
    });

    it('caso error: el IVA de una venta NO sale de un código de retención con cuenta', async () => {
      /*
       * El catálogo boliviano de dev trae IT, IUE, RC-IVA y cuatro retenciones, todos con cuenta de
       * salida configurada. «El primero vigente que tenga cuenta» mandaba el impuesto de la factura
       * a la cuenta de retención de IUE, y el asiento cuadraba exactamente igual.
       */
      const servicio = crear({
        codigosTributarios: [
          { ...iva, id: 'ret-iue', taxType: 'RET_IUE', effectiveFrom: '2026-06-01' },
          { ...iva, id: 'it', taxType: 'IT', effectiveFrom: '2026-05-01' },
        ],
      });
      await expect(
        servicio.resolveOutputTax('2026-09-19', undefined, undefined),
      ).rejects.toMatchObject({ response: { code: 'TAX_CODE_NOT_RESOLVED' } });
    });

    it('caso límite: con dos IVA de venta vigentes NO elige', async () => {
      const servicio = crear({
        codigosTributarios: [iva, { ...iva, id: 'iva-2', effectiveFrom: '2026-07-01' }],
      });
      await expect(servicio.resolveOutputTax('2026-09-19', undefined, undefined)).rejects.toThrow(
        /indica cuál aplica/,
      );
    });
  });

  describe('la cuenta contable del banco', () => {
    it('caso válido: la de la cuenta bancaria elegida', async () => {
      const servicio = crear({ cuentasBancarias: [{ id: 'banco', glAccountId: CUENTA }] });
      await expect(servicio.resolveBankGlAccountId(EMPRESA, 'banco', undefined)).resolves.toBe(
        CUENTA,
      );
    });

    it('caso límite: sin elegir cuenta, la principal de la empresa', async () => {
      const servicio = crear({
        cuentasBancarias: [
          { id: 'otra', glAccountId: 'otra-cuenta', isHouseBank: false, status: 'ACTIVE' },
          { id: 'casa', glAccountId: CUENTA, isHouseBank: true, status: 'ACTIVE' },
        ],
      });
      await expect(servicio.resolveBankGlAccountId(EMPRESA, undefined, undefined)).resolves.toBe(
        CUENTA,
      );
    });

    it('caso error: dos cuentas y ninguna principal: que lo diga quien cobró', async () => {
      const servicio = crear({
        cuentasBancarias: [
          { id: 'a', glAccountId: 'cuenta-a', isHouseBank: false, status: 'ACTIVE' },
          { id: 'b', glAccountId: 'cuenta-b', isHouseBank: false, status: 'ACTIVE' },
        ],
      });
      await expect(
        servicio.resolveBankGlAccountId(EMPRESA, undefined, undefined),
      ).rejects.toMatchObject({ response: { code: 'BANK_GL_ACCOUNT_NOT_RESOLVED' } });
    });
  });
});
