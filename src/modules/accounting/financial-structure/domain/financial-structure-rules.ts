import { BadRequestException, ConflictException } from '@nestjs/common';
import { Op, type WhereOptions } from 'sequelize';
import type {
  CreateAccountingPeriodDto,
  CreateGlAccountDto,
} from '../../shared/schemas/accounting.schemas';

/** Un año contable admite hasta 13 períodos: los doce meses y el período de ajuste. */
export const MAX_PERIODS_PER_FISCAL_YEAR = 13;

export function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function assertDateRangeIsValid(startDate: Date, endDate: Date, code: string): void {
  if (endDate < startDate) {
    throw new BadRequestException({
      code,
      message: 'La fecha final no puede ser anterior a la fecha inicial.',
    });
  }
}

/** El período contable debe caer dentro del rango de su año fiscal. */
export function assertPeriodInsideFiscalYear(
  period: Pick<CreateAccountingPeriodDto, 'startDate' | 'endDate'>,
  fiscalYear: { startDate: Date | string; endDate: Date | string },
): void {
  if (
    toDateOnly(period.startDate) < toDateOnly(fiscalYear.startDate) ||
    toDateOnly(period.endDate) > toDateOnly(fiscalYear.endDate)
  ) {
    throw new BadRequestException({
      code: 'PERIOD_OUTSIDE_FISCAL_YEAR',
      message: 'El período contable debe estar dentro del rango del año fiscal.',
    });
  }
}

/**
 * Siguiente número de período a partir del mayor existente. La UNIQUE (fiscal_year_id, period_no)
 * resuelve dos altas simultáneas con un 409 en vez de dos períodos con el mismo número.
 */
export function nextPeriodNumber(current: number | null): number {
  const next = (Number(current) || 0) + 1;
  if (next > MAX_PERIODS_PER_FISCAL_YEAR) {
    throw new ConflictException({
      code: 'FISCAL_YEAR_PERIODS_EXHAUSTED',
      message: 'El año fiscal ya tiene sus 13 períodos.',
    });
  }
  return next;
}

/** Activo y gasto son deudoras; pasivo, patrimonio, ingreso y contra-activo, acreedoras. */
export function assertGlAccountBalanceConvention(
  input: Pick<CreateGlAccountDto, 'accountType' | 'normalBalance'>,
): void {
  const expectedDebitTypes = new Set(['ASSET', 'EXPENSE']);
  const expectedCreditTypes = new Set(['LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_ASSET']);

  if (expectedDebitTypes.has(input.accountType) && input.normalBalance !== 'D') {
    throw new BadRequestException({
      code: 'INVALID_GL_NORMAL_BALANCE',
      message: 'Las cuentas de activo y gasto deben tener naturaleza deudora.',
    });
  }

  if (expectedCreditTypes.has(input.accountType) && input.normalBalance !== 'C') {
    throw new BadRequestException({
      code: 'INVALID_GL_NORMAL_BALANCE',
      message:
        'Las cuentas de pasivo, patrimonio, ingreso y contra-activo deben tener naturaleza acreedora.',
    });
  }
}

/** `WHERE <columna> IN (<entidades del token>)`, o nada para ADMIN (`allowed === null`). */
export function legalEntityScope(
  allowed: readonly string[] | null,
  column = 'legalEntityId',
): WhereOptions {
  if (allowed === null) return {};
  return { [column]: { [Op.in]: [...allowed] } } as WhereOptions;
}
