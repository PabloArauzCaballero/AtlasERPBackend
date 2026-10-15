import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { ContractHeaderModel } from '../../../../database/models';
import { IssueArInvoiceDto } from '../../shared/schemas/accounting.schemas';
import { AccountingDefaultsService } from '../../shared/services/accounting-defaults.service';
import { BusinessPartnerRoleValidationService } from '../../business-partners/services/business-partner-role-validation.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import {
  assertContractBillable,
  assertTaxFieldsConsistent,
  type ResolvedArInvoice,
} from '../domain/ar-invoice';

/** Deja la factura lista para emitir: lo que el alta dejó de preguntar y las guardas de negocio. */
@Injectable()
export class ArInvoicePreparation {
  constructor(
    private readonly accountingDefaultsService: AccountingDefaultsService,
    private readonly businessPartnerRoleValidationService: BusinessPartnerRoleValidationService,
    private readonly logger: PinoLoggerService,
    @InjectModel(ContractHeaderModel)
    private readonly contractHeaderModel: typeof ContractHeaderModel,
  ) {}

  /**
   * Lo que el alta dejó de preguntar.
   *
   * El impuesto sólo se resuelve si lo hay: informar cuenta fiscal en una factura sin impuesto es
   * un error que el propio servicio rechaza más abajo, y deducirla «por si acaso» lo provocaría.
   */
  async resolveDefaults(
    input: IssueArInvoiceDto,
    transaction: Transaction,
  ): Promise<ResolvedArInvoice> {
    const [arAccountId, accountingPeriodId, ledgerId] = await Promise.all([
      this.accountingDefaultsService.resolveArControlAccountId(
        input.legalEntityId,
        input.customerBpId,
        input.arAccountId,
        transaction,
      ),
      this.accountingDefaultsService.resolveOpenPeriodId(
        input.legalEntityId,
        input.invoiceDate,
        input.accountingPeriodId,
        transaction,
      ),
      this.accountingDefaultsService.resolveLedgerId(
        input.legalEntityId,
        input.ledgerId,
        transaction,
      ),
    ]);

    const impuesto =
      Number(input.taxAmount) > 0
        ? await this.accountingDefaultsService.resolveOutputTax(
            input.invoiceDate,
            input.taxCodeId,
            input.taxLiabilityAccountId,
            transaction,
          )
        : null;

    return {
      ...input,
      arAccountId,
      accountingPeriodId,
      ledgerId,
      ...(impuesto
        ? { taxCodeId: impuesto.taxCodeId, taxLiabilityAccountId: impuesto.taxLiabilityAccountId }
        : {}),
    };
  }

  async assertInputsAreSapSafe(input: ResolvedArInvoice, transaction: Transaction): Promise<void> {
    this.logger.debug('Validando factura AR con reglas SAP-like.', {
      layer: 'service',
      module: 'billing',
      action: 'assertInvoiceInputsAreSapSafe',
      legalEntityId: input.legalEntityId,
    });
    await this.businessPartnerRoleValidationService.assertHasAnyActiveRole(
      input.customerBpId,
      ['CUSTOMER', 'MERCHANT', 'INTERCOMPANY'],
      input.legalEntityId,
      transaction,
    );

    if (input.contractId) {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado a la factura no existe.',
        });
      }
      assertContractBillable(contract, input);
    }

    assertTaxFieldsConsistent(input);
  }
}
