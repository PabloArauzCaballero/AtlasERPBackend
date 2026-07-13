import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

export interface JournalLineAmount {
  debit: number;
  credit: number;
}

@Injectable()
export class DoubleEntryValidator {
  private readonly activeLogger: PinoLoggerService;

  constructor(logger?: PinoLoggerService) {
    this.activeLogger = logger ?? new PinoLoggerService();
  }

  validate(lines: JournalLineAmount[]): void {
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);

    this.activeLogger.debug('Validando doble partida.', {
      layer: 'validator',
      validator: 'DoubleEntryValidator',
      lineCount: lines.length,
      totalDebit,
      totalCredit,
    });

    for (const [index, line] of lines.entries()) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
        this.activeLogger.warn('Línea contable inválida detectada.', {
          layer: 'validator',
          validator: 'DoubleEntryValidator',
          lineNo: index + 1,
          debit,
          credit,
        });
        throw new BadRequestException({
          code: 'INVALID_JOURNAL_LINE',
          message: `La línea ${index + 1} debe tener débito o crédito, pero no ambos.`,
        });
      }
    }

    if (Math.abs(totalDebit - totalCredit) > 0.009) {
      this.activeLogger.warn('Asiento descuadrado detectado.', {
        layer: 'validator',
        validator: 'DoubleEntryValidator',
        totalDebit,
        totalCredit,
      });
      throw new BadRequestException({
        code: 'UNBALANCED_JOURNAL',
        message: 'El asiento no cuadra: total débito debe ser igual a total crédito.',
        details: { totalDebit, totalCredit },
      });
    }

    this.activeLogger.debug('Doble partida validada correctamente.', {
      layer: 'validator',
      validator: 'DoubleEntryValidator',
      totalDebit,
      totalCredit,
    });
  }
}
