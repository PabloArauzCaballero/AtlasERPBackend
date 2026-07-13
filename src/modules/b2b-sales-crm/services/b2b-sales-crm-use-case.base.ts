import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { TermType } from '../b2b-sales-crm.enums';
import type { RegisterPurchaseDto } from '../b2b-sales-crm.dtos';
import type {
  CommercialTermModel,
  ContractVersionModel,
  MDRRuleModel,
} from '../models/b2b-sales-crm.models';
import type { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

export abstract class B2BSalesCrmUseCaseBase {
  protected constructor(
    protected readonly repository: B2BSalesCrmRepository,
    protected readonly logger: PinoLoggerService,
  ) {}

  protected calculateExpectedRevenue(volume?: number, mdrRate?: number): string | null {
    if (volume === undefined || mdrRate === undefined) {
      return null;
    }

    return this.roundMoney((volume * mdrRate) / 100).toFixed(2);
  }

  protected assertPurchaseAmounts(
    purchaseAmount: number,
    downPaymentAmount: number,
    financedAmount: number,
  ): void {
    const expectedDownPayment = this.roundMoney(purchaseAmount * 0.6);
    const expectedFinancedAmount = this.roundMoney(purchaseAmount - expectedDownPayment);

    if (Math.abs(downPaymentAmount - expectedDownPayment) > 0.01) {
      throw new BadRequestException('El pago inicial debe representar 60% de la compra.');
    }

    if (Math.abs(financedAmount - expectedFinancedAmount) > 0.01) {
      throw new BadRequestException('El monto financiado debe representar el 40% restante.');
    }
  }

  protected assertInstallmentsMatchFinancedAmount(
    installments: RegisterPurchaseDto['installments'],
    financedAmount: number,
  ): void {
    const installmentsTotal = this.roundMoney(
      installments.reduce((sum, installment) => sum + installment.amount, 0),
    );
    const installmentNumbers = new Set<number>();

    for (const installment of installments) {
      if (installmentNumbers.has(installment.installmentNumber)) {
        throw new BadRequestException('No se permiten números de cuota duplicados.');
      }
      installmentNumbers.add(installment.installmentNumber);
    }

    if (Math.abs(installmentsTotal - financedAmount) > 0.01) {
      throw new BadRequestException('La suma de cuotas debe coincidir con el monto financiado.');
    }
  }

  protected calculateMdr(
    purchaseAmount: number,
    contractVersion: ContractVersionModel,
    branchId: string,
    productCategory?: string,
    riskSegment?: string,
  ): { ratePercent: number; amount: number; source: string } {
    const mdrRules = contractVersion.mdrRules ?? [];
    const rule = this.pickBestMdrRule(mdrRules, branchId, productCategory, riskSegment);

    if (rule) {
      const raw = (purchaseAmount * this.toNumber(rule.ratePercent)) / 100;
      const min = rule.minFeeAmount ? this.toNumber(rule.minFeeAmount) : raw;
      const max = rule.maxFeeAmount ? this.toNumber(rule.maxFeeAmount) : raw;
      const amount = Math.min(Math.max(raw, min), max);
      return {
        ratePercent: this.toNumber(rule.ratePercent),
        amount: this.roundMoney(amount),
        source: 'mdr_rules',
      };
    }

    const mdrTerm = (contractVersion.terms ?? []).find(
      (term: CommercialTermModel) => term.termType === TermType.MDR && term.ratePercent !== null,
    );

    if (!mdrTerm?.ratePercent) {
      throw new ConflictException('La versión contractual activa no tiene regla o término MDR.');
    }

    const rate = this.toNumber(mdrTerm.ratePercent);
    return {
      ratePercent: rate,
      amount: this.roundMoney((purchaseAmount * rate) / 100),
      source: 'commercial_terms',
    };
  }

  protected pickBestMdrRule(
    rules: MDRRuleModel[],
    branchId: string,
    productCategory?: string,
    riskSegment?: string,
  ): MDRRuleModel | null {
    const matching = rules.filter((rule) => {
      const branchMatches = !rule.branchId || rule.branchId === branchId;
      const categoryMatches = !rule.productCategory || rule.productCategory === productCategory;
      const riskMatches = !rule.riskSegment || rule.riskSegment === riskSegment;
      return branchMatches && categoryMatches && riskMatches;
    });

    if (matching.length === 0) {
      return null;
    }

    return (
      matching.sort((left, right) => this.ruleSpecificity(right) - this.ruleSpecificity(left))[0] ??
      null
    );
  }

  protected ruleSpecificity(rule: MDRRuleModel): number {
    return [rule.branchId, rule.productCategory, rule.riskSegment].filter(Boolean).length;
  }

  protected toNumber(value: string | number | null): number {
    if (value === null) {
      return 0;
    }

    return typeof value === 'number' ? value : Number(value);
  }

  protected roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  protected requireEntity<T>(entity: T | null, message: string): T {
    if (!entity) {
      throw new NotFoundException(message);
    }

    return entity;
  }
}
