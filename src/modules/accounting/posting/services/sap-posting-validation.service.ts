import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import {
  AccountingPeriodModel,
  BusinessPartnerModel,
  CostCenterModel,
  FiscalYearModel,
  GlAccountModel,
  LedgerModel,
  ProfitCenterModel,
  TaxCodeModel,
} from '../../../../database/models';
import { CreateAccountingDocumentDto } from '../../shared/schemas/accounting.schemas';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

interface ValidatedAccountingContext {
  period: AccountingPeriodModel;
  fiscalYear: FiscalYearModel;
  ledger: LedgerModel;
}

/**
 * Valida reglas SAP-like antes de crear un documento contable.
 *
 * Esta clase mantiene fuera del controller y del modelo las reglas críticas de posting:
 * entidad legal, ledger, período fiscal, cuentas activas, cuentas de control y dimensiones
 * obligatorias. Es deliberadamente explícita para que sea auditable.
 */
@Injectable()
export class SapPostingValidationService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingPeriodModel)
    private readonly accountingPeriodModel: typeof AccountingPeriodModel,
    @InjectModel(FiscalYearModel)
    private readonly fiscalYearModel: typeof FiscalYearModel,
    @InjectModel(LedgerModel)
    private readonly ledgerModel: typeof LedgerModel,
    @InjectModel(GlAccountModel)
    private readonly glAccountModel: typeof GlAccountModel,
    @InjectModel(BusinessPartnerModel)
    private readonly businessPartnerModel: typeof BusinessPartnerModel,
    @InjectModel(CostCenterModel)
    private readonly costCenterModel: typeof CostCenterModel,
    @InjectModel(ProfitCenterModel)
    private readonly profitCenterModel: typeof ProfitCenterModel,
    @InjectModel(TaxCodeModel)
    private readonly taxCodeModel: typeof TaxCodeModel,
  ) {}

  /**
   * Ejecuta todas las validaciones estructurales previas al asiento.
   *
   * @param input - Documento contable ya validado por Zod.
   * @param transaction - Transacción del caso de uso actual.
   * @returns Contexto financiero validado.
   */
  async assertDocumentCanBePosted(
    input: CreateAccountingDocumentDto,
    transaction: Transaction,
  ): Promise<ValidatedAccountingContext> {
    this.logger.debug('Validando documento antes de contabilización SAP-like.', {
      layer: 'service',
      module: 'accounting-documents',
      service: 'SapPostingValidationService',
      action: 'assertDocumentCanBePosted',
      documentNo: input.documentNo,
      legalEntityId: input.legalEntityId,
      periodId: input.accountingPeriodId,
      ledgerId: input.ledgerId,
      lineCount: input.lines.length,
    });
    const period = await this.assertPeriodBelongsToLegalEntityAndIsOpen(
      input.accountingPeriodId,
      input.legalEntityId,
      input.postingDate,
      transaction,
    );
    const fiscalYear = await this.getFiscalYear(period.fiscalYearId, transaction);
    const ledger = await this.assertLedgerBelongsToLegalEntity(
      input.ledgerId,
      input.legalEntityId,
      transaction,
    );

    await this.assertLinesUseValidAccountsAndDimensions(input, transaction);

    this.logger.debug('Documento validado para contabilización SAP-like.', {
      layer: 'service',
      module: 'accounting-documents',
      service: 'SapPostingValidationService',
      action: 'assertDocumentCanBePosted',
      documentNo: input.documentNo,
      fiscalYearId: fiscalYear.id,
      ledgerId: ledger.id,
    });
    return { period, fiscalYear, ledger };
  }

  private async assertPeriodBelongsToLegalEntityAndIsOpen(
    periodId: string,
    legalEntityId: string,
    postingDate: Date,
    transaction: Transaction,
  ): Promise<AccountingPeriodModel> {
    const period = await this.accountingPeriodModel.findByPk(periodId, { transaction });

    if (!period) {
      this.logger.warn('Período no encontrado durante validación de posting.', {
        layer: 'service',
        module: 'accounting-documents',
        service: 'SapPostingValidationService',
        action: 'assertPeriodBelongsToLegalEntityAndIsOpen',
        periodId,
        legalEntityId,
      });
      throw new NotFoundException({
        code: 'ACCOUNTING_PERIOD_NOT_FOUND',
        message: 'El período contable no existe.',
      });
    }

    if (!period.isOpen || period.closeStatus !== 'OPEN') {
      this.logger.warn('Período cerrado durante validación de posting.', {
        layer: 'service',
        module: 'accounting-documents',
        service: 'SapPostingValidationService',
        action: 'assertPeriodBelongsToLegalEntityAndIsOpen',
        periodId,
        closeStatus: period.closeStatus,
        isOpen: period.isOpen,
      });
      throw new ConflictException({
        code: 'ACCOUNTING_PERIOD_CLOSED',
        message: 'El período contable está cerrado y no permite contabilizaciones.',
      });
    }

    const fiscalYear = await this.getFiscalYear(period.fiscalYearId, transaction);
    if (fiscalYear.legalEntityId !== legalEntityId) {
      throw new ConflictException({
        code: 'PERIOD_LEGAL_ENTITY_MISMATCH',
        message: 'El período contable no pertenece a la entidad legal del documento.',
      });
    }

    const postingDateOnly = this.toDateOnly(postingDate);
    const periodStart = this.toDateOnly(period.startDate);
    const periodEnd = this.toDateOnly(period.endDate);

    if (postingDateOnly < periodStart || postingDateOnly > periodEnd) {
      throw new ConflictException({
        code: 'POSTING_DATE_OUTSIDE_PERIOD',
        message: 'La fecha de contabilización no cae dentro del período contable informado.',
        details: { postingDate: postingDateOnly, periodStart, periodEnd },
      });
    }

    return period;
  }

  private async getFiscalYear(
    fiscalYearId: string,
    transaction: Transaction,
  ): Promise<FiscalYearModel> {
    const fiscalYear = await this.fiscalYearModel.findByPk(fiscalYearId, { transaction });

    if (!fiscalYear) {
      throw new NotFoundException({
        code: 'FISCAL_YEAR_NOT_FOUND',
        message: 'El año fiscal asociado al período no existe.',
      });
    }

    return fiscalYear;
  }

  private async assertLedgerBelongsToLegalEntity(
    ledgerId: string,
    legalEntityId: string,
    transaction: Transaction,
  ): Promise<LedgerModel> {
    const ledger = await this.ledgerModel.findByPk(ledgerId, { transaction });

    if (!ledger) {
      throw new NotFoundException({
        code: 'LEDGER_NOT_FOUND',
        message: 'El ledger contable no existe.',
      });
    }

    if (ledger.legalEntityId !== legalEntityId) {
      this.logger.warn('Ledger fuera de entidad legal durante validación de posting.', {
        layer: 'service',
        module: 'accounting-documents',
        service: 'SapPostingValidationService',
        action: 'assertLedgerBelongsToLegalEntity',
        ledgerId,
        legalEntityId,
        ledgerLegalEntityId: ledger.legalEntityId,
      });
      throw new ConflictException({
        code: 'LEDGER_LEGAL_ENTITY_MISMATCH',
        message: 'El ledger no pertenece a la entidad legal del documento.',
      });
    }

    if (ledger.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'LEDGER_NOT_ACTIVE',
        message: 'El ledger informado no está activo.',
      });
    }

    return ledger;
  }

  private async assertLinesUseValidAccountsAndDimensions(
    input: CreateAccountingDocumentDto,
    transaction: Transaction,
  ): Promise<void> {
    this.logger.debug('Validando cuentas y dimensiones de líneas contables.', {
      layer: 'service',
      module: 'accounting-documents',
      service: 'SapPostingValidationService',
      action: 'assertLinesUseValidAccountsAndDimensions',
      documentNo: input.documentNo,
      lineCount: input.lines.length,
    });
    const glAccountIds = [...new Set(input.lines.map((line) => line.glAccountId))];
    const accounts = await this.glAccountModel.findAll({
      where: { id: glAccountIds },
      transaction,
    });
    const accountsById = new Map(accounts.map((account) => [account.id, account]));

    for (const [index, line] of input.lines.entries()) {
      const account = accountsById.get(line.glAccountId);
      const lineNumber = index + 1;

      if (!account) {
        throw new NotFoundException({
          code: 'GL_ACCOUNT_NOT_FOUND',
          message: `La cuenta contable de la línea ${lineNumber} no existe.`,
        });
      }

      if (account.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'GL_ACCOUNT_NOT_ACTIVE',
          message: `La cuenta contable de la línea ${lineNumber} no está activa.`,
          details: { glAccountId: line.glAccountId },
        });
      }

      this.assertRequiredDimensions(line, account, lineNumber);
      this.assertControlAccountHasSubledgerReference(input, line, account, lineNumber);
      await this.assertDimensionReferencesExist(line, lineNumber, transaction);
    }
  }

  private assertRequiredDimensions(
    line: CreateAccountingDocumentDto['lines'][number],
    account: GlAccountModel,
    lineNumber: number,
  ): void {
    if (account.requiresPartner && !line.partnerId) {
      throw new BadRequestException({
        code: 'PARTNER_REQUIRED_FOR_GL_ACCOUNT',
        message: `La línea ${lineNumber} requiere contraparte porque la cuenta lo exige.`,
      });
    }

    if (account.requiresCostCenter && !line.costCenterId) {
      throw new BadRequestException({
        code: 'COST_CENTER_REQUIRED_FOR_GL_ACCOUNT',
        message: `La línea ${lineNumber} requiere centro de costo porque la cuenta lo exige.`,
      });
    }

    if (account.requiresProfitCenter && !line.profitCenterId) {
      throw new BadRequestException({
        code: 'PROFIT_CENTER_REQUIRED_FOR_GL_ACCOUNT',
        message: `La línea ${lineNumber} requiere profit center porque la cuenta lo exige.`,
      });
    }

    if (account.requiresTaxCode && !line.taxCodeId) {
      throw new BadRequestException({
        code: 'TAX_CODE_REQUIRED_FOR_GL_ACCOUNT',
        message: `La línea ${lineNumber} requiere código tributario porque la cuenta lo exige.`,
      });
    }
  }

  private assertControlAccountHasSubledgerReference(
    input: CreateAccountingDocumentDto,
    line: CreateAccountingDocumentDto['lines'][number],
    account: GlAccountModel,
    lineNumber: number,
  ): void {
    if (!account.isControlAccount) return;

    const allowedSubledgerReferences = new Set([
      'AR_INVOICE',
      'AP_INVOICE',
      'RECEIPT',
      'SUPPLIER_PAYMENT',
      'LOAN',
      'ASSET',
      'PROVISION',
      'REVERSAL',
      'INTERCOMPANY',
    ]);

    if (!line.referenceType || !allowedSubledgerReferences.has(line.referenceType)) {
      throw new BadRequestException({
        code: 'CONTROL_ACCOUNT_REQUIRES_SUBLEDGER_REFERENCE',
        message: `La línea ${lineNumber} usa una cuenta de control y debe estar ligada a un submayor válido.`,
      });
    }

    if (input.sourceSystem === 'ACCOUNTING' && input.sourceType !== 'REVERSAL') {
      throw new BadRequestException({
        code: 'DIRECT_MANUAL_POSTING_TO_CONTROL_ACCOUNT_BLOCKED',
        message:
          'No se permite contabilizar manualmente cuentas de control; usa el submayor correspondiente.',
      });
    }
  }

  private async assertDimensionReferencesExist(
    line: CreateAccountingDocumentDto['lines'][number],
    lineNumber: number,
    transaction: Transaction,
  ): Promise<void> {
    if (line.partnerId) {
      const partner = await this.businessPartnerModel.findByPk(line.partnerId, { transaction });
      if (!partner || partner.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'LINE_PARTNER_NOT_ACTIVE',
          message: `La contraparte de la línea ${lineNumber} no existe o no está activa.`,
        });
      }
    }

    if (line.costCenterId) {
      const costCenter = await this.costCenterModel.findByPk(line.costCenterId, { transaction });
      if (!costCenter || costCenter.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'LINE_COST_CENTER_NOT_ACTIVE',
          message: `El centro de costo de la línea ${lineNumber} no existe o no está activo.`,
        });
      }
    }

    if (line.profitCenterId) {
      const profitCenter = await this.profitCenterModel.findByPk(line.profitCenterId, {
        transaction,
      });
      if (!profitCenter || profitCenter.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'LINE_PROFIT_CENTER_NOT_ACTIVE',
          message: `El profit center de la línea ${lineNumber} no existe o no está activo.`,
        });
      }
    }

    if (line.taxCodeId) {
      const taxCode = await this.taxCodeModel.findByPk(line.taxCodeId, { transaction });
      if (!taxCode || taxCode.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'LINE_TAX_CODE_NOT_ACTIVE',
          message: `El código tributario de la línea ${lineNumber} no existe o no está activo.`,
        });
      }
    }
  }

  private toDateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
  }
}
