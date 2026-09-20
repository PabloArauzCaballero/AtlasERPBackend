import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, WhereOptions } from 'sequelize';
import {
  AccountingPeriodModel,
  BankAccountModel,
  BusinessPartnerDefaultAccountModel,
  FiscalYearModel,
  LedgerModel,
  TaxCodeModel,
} from '../../../../database/models';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/** La fecha de un documento como `YYYY-MM-DD`, que es como la guardan las columnas `DATEONLY`. */
function diaDe(fecha: Date | string): string {
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  return valor.toISOString().slice(0, 10);
}

/**
 * Lo que el sistema ya sabe y estaba pidiendo que se teclease.
 *
 * Emitir una factura exigía elegir a mano SIETE identificadores que no son una decisión de quien
 * factura: el libro contable, el período, la cuenta de control de cuentas por cobrar del cliente,
 * la cuenta de impuesto, el código tributario, la cuenta del banco del recibo y la de control AR.
 * Todos salen de datos que ya están en la base —el período lo dice la fecha, el libro lo dice la
 * entidad legal, la cuenta del cliente está en su ficha—, así que pedirlos sólo servía para dos
 * cosas: alargar el formulario a dieciocho campos y dejar que alguien eligiera el equivocado sin
 * que nada lo avisara (un asiento contra el libro de otra entidad cuadra igual).
 *
 * Reglas de la casa:
 *
 * 1. Lo que llega explícito MANDA. Quien sabe lo que hace sigue pudiendo decirlo, y la API no
 *    rompe a nadie que ya la llamaba con todos los campos.
 * 2. Si no se puede deducir, se falla con el motivo y qué hacer —nunca se elige «uno cualquiera»—.
 *    Una cuenta elegida al azar produce un asiento que cuadra y miente, que es la peor avería
 *    posible en contabilidad: no se ve hasta el cierre.
 */
@Injectable()
export class AccountingDefaultsService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(LedgerModel) private readonly ledgerModel: typeof LedgerModel,
    @InjectModel(FiscalYearModel) private readonly fiscalYearModel: typeof FiscalYearModel,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
    @InjectModel(BusinessPartnerDefaultAccountModel)
    private readonly defaultAccountModel: typeof BusinessPartnerDefaultAccountModel,
    @InjectModel(TaxCodeModel) private readonly taxCodeModel: typeof TaxCodeModel,
    @InjectModel(BankAccountModel) private readonly bankAccountModel: typeof BankAccountModel,
  ) {}

  /**
   * El libro contable de la entidad legal.
   *
   * Preferencia: el marcado por defecto; si no hay ninguno, el único activo. Con dos activos y
   * ninguno por defecto NO se elige: la diferencia entre libros es el criterio contable con el
   * que se va a leer el asiento para siempre.
   */
  async resolveLedgerId(
    legalEntityId: string,
    provided: string | undefined,
    transaction?: Transaction,
  ): Promise<string> {
    if (provided) return provided;
    const activos = await this.ledgerModel.findAll({
      where: { legalEntityId, status: 'ACTIVE' } as WhereOptions,
      order: [['code', 'ASC']],
      ...(transaction ? { transaction } : {}),
    });
    const porDefecto = activos.find((fila) => fila.isDefault);
    if (porDefecto) return porDefecto.id;
    if (activos.length === 1) return activos[0]!.id;
    throw new BadRequestException({
      code: 'LEDGER_NOT_RESOLVED',
      message: activos.length
        ? 'Esta empresa tiene más de un libro contable activo y ninguno marcado como predeterminado. Marca uno en Estructura financiera o indica cuál usar.'
        : 'Esta empresa no tiene ningún libro contable activo. Créalo en Estructura financiera antes de registrar documentos.',
      details: { legalEntityId, activos: activos.length },
    });
  }

  /**
   * El período contable ABIERTO en el que cae la fecha del documento.
   *
   * Es la deducción más segura de todas —la fecha lo determina— y era la que más equivocaciones
   * producía: el desplegable ofrecía todos los períodos de todas las entidades, así que se podía
   * contabilizar una factura de septiembre contra el período de julio de otra empresa.
   */
  async resolveOpenPeriodId(
    legalEntityId: string,
    date: Date | string,
    provided: string | undefined,
    transaction?: Transaction,
  ): Promise<string> {
    if (provided) return provided;
    const dia = diaDe(date);
    const anios = await this.fiscalYearModel.findAll({
      where: { legalEntityId } as WhereOptions,
      attributes: ['id'],
      ...(transaction ? { transaction } : {}),
    });
    if (!anios.length) {
      throw new BadRequestException({
        code: 'ACCOUNTING_PERIOD_NOT_RESOLVED',
        message:
          'Esta empresa no tiene ningún ejercicio fiscal creado, así que no hay período contable donde registrar el documento.',
        details: { legalEntityId, fecha: dia },
      });
    }
    const candidatos = await this.accountingPeriodModel.findAll({
      where: {
        fiscalYearId: { [Op.in]: anios.map((fila) => fila.id) },
        startDate: { [Op.lte]: dia },
        endDate: { [Op.gte]: dia },
      } as WhereOptions,
      order: [['startDate', 'ASC']],
      ...(transaction ? { transaction } : {}),
    });
    const abierto = candidatos.find((fila) => fila.isOpen && fila.closeStatus === 'OPEN');
    if (abierto) return abierto.id;
    throw new BadRequestException({
      code: 'ACCOUNTING_PERIOD_NOT_RESOLVED',
      message: candidatos.length
        ? `El período contable del ${dia} está cerrado. Cámbiale la fecha al documento o reábrelo desde Cierre de períodos.`
        : `Ningún período contable de esta empresa cubre el ${dia}. Créalo en Estructura financiera.`,
      details: { legalEntityId, fecha: dia, periodosEnLaFecha: candidatos.length },
    });
  }

  /**
   * La cuenta de un propósito concreto en la ficha del socio (AR_CONTROL, CUSTOMER_ADVANCES…).
   *
   * Esa tabla existe desde el principio y se auto-provisiona vacía al crear el socio; nadie la
   * estaba leyendo, así que la cuenta se volvía a elegir a mano en cada factura y en cada recibo
   * del mismo cliente —con la posibilidad de que fueran distintas—.
   */
  async resolvePartnerAccountId(
    businessPartnerId: string,
    accountPurpose: string,
    provided: string | undefined,
    transaction?: Transaction,
  ): Promise<string> {
    if (provided) return provided;
    const fila = await this.defaultAccountModel.findOne({
      where: { businessPartnerId, accountPurpose, status: 'ACTIVE' } as WhereOptions,
      ...(transaction ? { transaction } : {}),
    });
    if (fila?.glAccountId) return fila.glAccountId;
    throw new BadRequestException({
      code: 'PARTNER_DEFAULT_ACCOUNT_NOT_SET',
      message: `Este socio no tiene asignada su cuenta contable «${accountPurpose}». Asígnala en su ficha (Cuentas por defecto) y vuelve a intentarlo.`,
      details: { businessPartnerId, accountPurpose },
    });
  }

  /**
   * El impuesto de una venta: qué código aplica y a qué cuenta de pasivo va.
   *
   * `tax_code.output_gl_account_id` es exactamente eso —la cuenta del IVA que se debe— y se
   * estaba pidiendo por separado, con la posibilidad de informar un código y la cuenta de otro.
   */
  async resolveOutputTax(
    date: Date | string,
    providedTaxCodeId: string | undefined,
    providedAccountId: string | undefined,
    transaction?: Transaction,
  ): Promise<{ taxCodeId: string; taxLiabilityAccountId: string }> {
    if (providedTaxCodeId && providedAccountId) {
      return { taxCodeId: providedTaxCodeId, taxLiabilityAccountId: providedAccountId };
    }
    const dia = diaDe(date);
    const vigentes = await this.taxCodeModel.findAll({
      where: {
        status: 'ACTIVE',
        effectiveFrom: { [Op.lte]: dia },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: dia } }],
      } as WhereOptions,
      order: [['effectiveFrom', 'DESC']],
      ...(transaction ? { transaction } : {}),
    });
    const elegido = providedTaxCodeId
      ? vigentes.find((fila) => fila.id === providedTaxCodeId)
      : vigentes.find((fila) => fila.outputGlAccountId);
    if (elegido?.outputGlAccountId) {
      return {
        taxCodeId: elegido.id,
        taxLiabilityAccountId: providedAccountId ?? elegido.outputGlAccountId,
      };
    }
    throw new BadRequestException({
      code: 'TAX_CODE_NOT_RESOLVED',
      message:
        'No hay ningún código tributario vigente con su cuenta de impuesto por pagar configurada. Revisa Impuestos del plan de cuentas o emite la factura sin impuesto.',
      details: { fecha: dia, vigentes: vigentes.length },
    });
  }

  /**
   * La cuenta contable del banco donde entra un cobro.
   *
   * Sale de la propia cuenta bancaria elegida; si no se eligió ninguna, de la cuenta de la casa
   * (`is_house_bank`) de esa entidad legal, que es donde entra el dinero por defecto.
   */
  async resolveBankGlAccountId(
    legalEntityId: string,
    bankAccountId: string | undefined,
    provided: string | undefined,
    transaction?: Transaction,
  ): Promise<string> {
    if (provided) return provided;
    if (bankAccountId) {
      const cuenta = await this.bankAccountModel.findByPk(bankAccountId, {
        ...(transaction ? { transaction } : {}),
      });
      if (cuenta?.glAccountId) return cuenta.glAccountId;
      throw new BadRequestException({
        code: 'BANK_GL_ACCOUNT_NOT_SET',
        message:
          'La cuenta bancaria elegida no tiene cuenta contable asociada. Asígnasela en Tesorería y vuelve a intentarlo.',
        details: { bankAccountId },
      });
    }
    const candidatas = await this.bankAccountModel.findAll({
      where: { legalEntityId, status: 'ACTIVE' } as WhereOptions,
      order: [['accountName', 'ASC']],
      ...(transaction ? { transaction } : {}),
    });
    const conCuenta = candidatas.filter((fila) => fila.glAccountId);
    const casa = conCuenta.find((fila) => fila.isHouseBank);
    if (casa?.glAccountId) return casa.glAccountId;
    if (conCuenta.length === 1) return conCuenta[0]!.glAccountId!;
    this.logger.warn('No se pudo deducir la cuenta contable del banco.', {
      layer: 'service',
      module: 'accounting-defaults',
      action: 'resolveBankGlAccountId',
      legalEntityId,
      candidatas: conCuenta.length,
    });
    throw new BadRequestException({
      code: 'BANK_GL_ACCOUNT_NOT_RESOLVED',
      message: conCuenta.length
        ? 'Esta empresa tiene varias cuentas bancarias y ninguna marcada como cuenta principal. Elige en qué cuenta entró el dinero.'
        : 'Esta empresa no tiene ninguna cuenta bancaria con cuenta contable asociada. Créala en Tesorería antes de registrar cobros.',
      details: { legalEntityId, candidatas: conCuenta.length },
    });
  }
}
