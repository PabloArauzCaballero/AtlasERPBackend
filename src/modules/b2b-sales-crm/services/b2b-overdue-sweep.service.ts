import { Injectable } from '@nestjs/common';
import { Op } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { InstallmentStatus } from '../b2b-sales-crm.enums';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

/** Lo que pasó en una pasada: cuántas cuotas vencidas se revisaron y cuántas cambiaron. */
export interface OverdueSweepResult {
  corte: string;
  revisadas: number;
  marcadas: number;
  /** Cuotas vencidas con un pago reportado o confirmado: se dejan como están. */
  conPago: number;
}

/** Pagos del consumidor al comercio que cuentan como «pagada»: reportada o confirmada. */
const PAGOS_VALIDOS = ['REPORTED', 'CONFIRMED'];

/**
 * Marca OVERDUE las cuotas BNPL cuya fecha de vencimiento ya pasó y no tienen pago del consumidor.
 *
 * Hasta el 2026-09-14 una cuota sólo pasaba a OVERDUE cuando alguien programaba la cobertura a
 * mano (`scheduleCoverage`): una cuota vencida y sin tocar seguía SCHEDULED para siempre, y el
 * tablero de Finanzas —que cuenta «cuotas en mora sin cobertura»— la subestimaba. La cobertura al
 * comercio sigue siendo una decisión de una persona; lo que aquí se automatiza es el HECHO de que
 * la cuota venció.
 *
 * Idempotente: una cuota ya OVERDUE no se vuelve a tocar, y una pasada sin vencidas no escribe.
 */
@Injectable()
export class B2BOverdueSweepService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly logger: PinoLoggerService,
  ) {}

  async sweep(today = hoy()): Promise<OverdueSweepResult> {
    return this.repository.transaction(async (transaction) => {
      const vencidas = await this.repository.installments.findAll({
        attributes: ['id'],
        where: { status: InstallmentStatus.SCHEDULED, dueDate: { [Op.lt]: today } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const ids = vencidas.map((cuota) => cuota.id);
      if (ids.length === 0) {
        return { corte: today, revisadas: 0, marcadas: 0, conPago: 0 };
      }
      const pagadas = await this.repository.consumerPaymentsToMerchant.findAll({
        attributes: ['installmentId'],
        where: { installmentId: { [Op.in]: ids }, status: { [Op.in]: PAGOS_VALIDOS } },
        transaction,
      });
      const conPago = new Set(pagadas.map((pago) => pago.installmentId));
      const aMarcar = ids.filter((id) => !conPago.has(id));
      if (aMarcar.length > 0) {
        await this.repository.installments.update(
          { status: InstallmentStatus.OVERDUE },
          { where: { id: { [Op.in]: aMarcar } }, transaction },
        );
      }
      const result = {
        corte: today,
        revisadas: ids.length,
        marcadas: aMarcar.length,
        conPago: conPago.size,
      };
      this.logger.infoContext(B2BOverdueSweepService.name, 'BNPL overdue sweep', result);
      return result;
    });
  }
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}
