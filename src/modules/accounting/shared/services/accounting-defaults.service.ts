import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
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
    private readonly sequelize: Sequelize,
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
   * La cuenta de control de cuentas por cobrar de una factura o un cobro.
   *
   * Tres escalones, y ninguno adivina:
   *
   * 1. lo que venga explícito;
   * 2. la cuenta que el socio tiene en su ficha (`AR_CONTROL`), que es donde debe estar;
   * 3. **la que esta empresa ya venía usando** en sus facturas por cobrar contabilizadas.
   *
   * El tercero existe porque la ficha se auto-provisiona VACÍA: en dev, los tres socios tenían su
   * hueco de `AR_CONTROL` a null y las ocho facturas emitidas usaban todas la misma cuenta, la que
   * elegía a mano quien facturaba. Sin este escalón, quitar el campo del formulario habría dejado
   * la emisión bloqueada en toda instalación existente —y en cada cliente nuevo— hasta que alguien
   * rellenara una ficha que nadie sabía que existía.
   *
   * No es adivinar: es leer lo que dicen los libros de ESA empresa, y sólo vale si dicen UNA cosa.
   * Con dos cuentas distintas en el histórico se rechaza, porque ahí sí hay una decisión que tomar.
   */
  async resolveArControlAccountId(
    legalEntityId: string,
    businessPartnerId: string,
    provided: string | undefined,
    transaction?: Transaction,
  ): Promise<string> {
    try {
      return await this.resolvePartnerAccountId(
        businessPartnerId,
        'AR_CONTROL',
        provided,
        transaction,
      );
    } catch (error) {
      const usadas = await this.arControlAccountsUsedBy(legalEntityId, transaction);
      if (usadas.length !== 1) throw error;
      this.logger.info('Cuenta de control AR deducida del histórico de la empresa.', {
        layer: 'service',
        module: 'accounting-defaults',
        action: 'resolveArControlAccountId',
        legalEntityId,
        businessPartnerId,
        glAccountId: usadas[0],
      });
      return usadas[0]!;
    }
  }

  /** Las cuentas al DEBE de las facturas por cobrar ya contabilizadas de una empresa. */
  private async arControlAccountsUsedBy(
    legalEntityId: string,
    transaction?: Transaction,
  ): Promise<string[]> {
    const filas = await this.sequelize.query<{ gl_account_id: string }>(
      `SELECT DISTINCT l.gl_account_id
         FROM atlas_accounting.journal_entry_line l
         JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id
         JOIN atlas_accounting.accounting_document d ON d.id = j.accounting_document_id
        WHERE d.legal_entity_id = :legalEntityId
          AND l.reference_type = 'AR_INVOICE'
          AND l.debit > 0
        LIMIT 3`,
      {
        replacements: { legalEntityId },
        type: QueryTypes.SELECT,
        ...(transaction ? { transaction } : {}),
      },
    );
    return filas.map((fila) => fila.gl_account_id);
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
    if (providedTaxCodeId) {
      const pedido = vigentes.find((fila) => fila.id === providedTaxCodeId);
      const cuenta = providedAccountId ?? pedido?.outputGlAccountId;
      if (pedido && cuenta) return { taxCodeId: pedido.id, taxLiabilityAccountId: cuenta };
      throw new BadRequestException({
        code: 'TAX_CODE_NOT_RESOLVED',
        message: pedido
          ? 'El código tributario indicado no tiene cuenta de impuesto por pagar configurada.'
          : 'El código tributario indicado no está vigente en la fecha de la factura.',
        details: { fecha: dia, taxCodeId: providedTaxCodeId },
      });
    }
    /*
     * De una VENTA sale IVA débito fiscal, y sólo eso.
     *
     * El catálogo boliviano de dev tiene once códigos vigentes y siete de ellos traen cuenta de
     * salida —IT, IUE, RC-IVA, las retenciones—: coger «el primero que tenga cuenta» habría
     * mandado el impuesto de una factura a la cuenta de retención de IUE, y el asiento cuadra
     * igual. Se filtra por tipo y, si quedan dos, NO se elige.
     */
    const candidatos = vigentes.filter(
      (fila) => fila.taxType === 'IVA' && Boolean(fila.outputGlAccountId),
    );
    if (candidatos.length === 1) {
      return {
        taxCodeId: candidatos[0]!.id,
        taxLiabilityAccountId: candidatos[0]!.outputGlAccountId!,
      };
    }
    throw new BadRequestException({
      code: 'TAX_CODE_NOT_RESOLVED',
      message: candidatos.length
        ? 'Hay más de un código de IVA de venta vigente con cuenta de impuesto configurada, así que el sistema no elige por ti: indica cuál aplica.'
        : 'No hay ningún código de IVA de venta vigente con su cuenta de impuesto por pagar configurada. Revisa Impuestos del plan de cuentas o emite la factura sin impuesto.',
      details: { fecha: dia, vigentes: vigentes.length, candidatos: candidatos.length },
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
