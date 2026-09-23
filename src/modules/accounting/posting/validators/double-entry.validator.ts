import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { fromMinorUnits, toMinorUnits } from '../../../../common/money/decimal-amount.util';

export interface JournalLineAmount {
  debit: number | string;
  credit: number | string;
}

const CENT_AMOUNT = /^\d+(?:\.\d{1,2})?$/;
const MAX_LINE_CENTS = 999_999_999_999_999_999n; // numeric(18,2)

function cents(value: number | string): bigint | null {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }
  const text = String(value);
  if (!CENT_AMOUNT.test(text)) return null;
  const amount = toMinorUnits(text);
  return amount <= MAX_LINE_CENTS ? amount : null;
}

@Injectable()
export class DoubleEntryValidator {
  private readonly activeLogger: PinoLoggerService;

  constructor(logger?: PinoLoggerService) {
    this.activeLogger = logger ?? new PinoLoggerService();
  }

  validate(lines: JournalLineAmount[]): void {
    let totalDebit = 0n;
    let totalCredit = 0n;

    for (const [index, line] of lines.entries()) {
      const debit = cents(line.debit);
      const credit = cents(line.credit);

      if (
        debit === null ||
        credit === null ||
        (debit === 0n && credit === 0n) ||
        (debit > 0n && credit > 0n)
      ) {
        this.activeLogger.warn('Línea contable inválida detectada.', {
          layer: 'validator',
          validator: 'DoubleEntryValidator',
          lineNo: index + 1,
        });
        throw new BadRequestException({
          code: 'INVALID_JOURNAL_LINE',
          message: `La línea ${index + 1} debe tener débito o crédito, pero no ambos.`,
        });
      }
      totalDebit += debit;
      totalCredit += credit;
    }

    const debitAmount = fromMinorUnits(totalDebit);
    const creditAmount = fromMinorUnits(totalCredit);
    this.activeLogger.debug('Validando doble partida.', {
      layer: 'validator',
      validator: 'DoubleEntryValidator',
      lineCount: lines.length,
      totalDebit: debitAmount,
      totalCredit: creditAmount,
    });

    if (totalDebit !== totalCredit) {
      this.activeLogger.warn('Asiento descuadrado detectado.', {
        layer: 'validator',
        validator: 'DoubleEntryValidator',
        totalDebit: debitAmount,
        totalCredit: creditAmount,
      });
      throw new BadRequestException({
        code: 'UNBALANCED_JOURNAL',
        message: 'El asiento no cuadra: total débito debe ser igual a total crédito.',
        details: { totalDebit: debitAmount, totalCredit: creditAmount },
      });
    }

    this.activeLogger.debug('Doble partida validada correctamente.', {
      layer: 'validator',
      validator: 'DoubleEntryValidator',
      totalDebit: debitAmount,
      totalCredit: creditAmount,
    });
  }
}
