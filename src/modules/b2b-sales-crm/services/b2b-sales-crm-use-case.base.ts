import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { TermType } from '../b2b-sales-crm.enums';
import {
  computeMdrFee,
  purchaseSplitViolations,
  type PurchaseSplitInput,
} from '../domain/merchant-billing-math';
import { mdrRuleSpecificity } from '../domain/mdr-rule-specificity';
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

  /**
   * Reparto de la compra en céntimos exactos (P-07): inicial = 60 % (±0,01 por el redondeo de
   * quien lo calcula), financiado = compra − inicial y suma de cuotas = financiado, EXACTOS. Antes
   * se comparaba en coma flotante con un céntimo de tolerancia en las tres reglas, así que una
   * cuota podía perder un céntimo sin que nadie lo notara.
   */
  protected assertPurchaseSplit(input: PurchaseSplitInput): void {
    const [violation] = purchaseSplitViolations(input);
    if (violation) {
      throw new BadRequestException({ code: violation.code, message: violation.message });
    }
  }

  /**
   * MDR de la compra con la versión contractual que se le pasa —la vigente AL COMPRAR— en
   * unidades menores exactas, tasa de 6 decimales y redondeo `HALF_UP` (ver `computeMdrFee`).
   * Devuelve además la regla y la tasa aplicadas para guardarlas en la compra: las reglas MDR se
   * pueden editar después y sin esa instantánea la comisión no se podría reconstruir.
   */
  protected calculateMdr(
    purchaseAmount: number | string,
    contractVersion: ContractVersionModel,
    branchId: string,
    productCategory?: string,
    riskSegment?: string,
  ): {
    ratePercent: string;
    amount: string;
    source: 'mdr_rules' | 'commercial_terms';
    ruleId: string | null;
  } {
    const mdrRules = contractVersion.mdrRules ?? [];
    const rule = this.pickBestMdrRule(mdrRules, branchId, productCategory, riskSegment);

    if (rule) {
      const fee = computeMdrFee(purchaseAmount, {
        ratePercent: rule.ratePercent,
        minFeeAmount: rule.minFeeAmount,
        maxFeeAmount: rule.maxFeeAmount,
      });
      return {
        ratePercent: fee.ratePercent,
        amount: fee.fee,
        source: 'mdr_rules',
        ruleId: rule.id,
      };
    }

    const mdrTerm = (contractVersion.terms ?? []).find(
      (term: CommercialTermModel) => term.termType === TermType.MDR && term.ratePercent !== null,
    );

    if (!mdrTerm?.ratePercent) {
      throw new ConflictException('La versión contractual activa no tiene regla o término MDR.');
    }

    const fee = computeMdrFee(purchaseAmount, { ratePercent: mdrTerm.ratePercent });
    return {
      ratePercent: fee.ratePercent,
      amount: fee.fee,
      source: 'commercial_terms',
      ruleId: null,
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

  /** El peso sale de `MDR_DIMENSION_WEIGHT`: es el MISMO criterio con que la pantalla ordena. */
  protected ruleSpecificity(rule: MDRRuleModel): number {
    return mdrRuleSpecificity(rule);
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
