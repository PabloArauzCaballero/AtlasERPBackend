import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import type { ContractVersionModel } from '../../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';

/** Activa y vigente hoy, y su contrato activo: la misma regla que `findActiveContractVersion`. */
export function isContractVersionActivatable(
  version: {
    status: string;
    validFrom: string;
    validTo: string | null;
    contract?: { status: string } | undefined;
  },
  today: string,
): boolean {
  return (
    version.status === 'ACTIVE' &&
    version.contract?.status === 'ACTIVE' &&
    version.validFrom <= today &&
    (version.validTo === null || version.validTo >= today)
  );
}

/** Con qué contrato se activa un caso: la regla que comparten la activación, el detalle y el tablero. */
@Injectable()
export class ActivationContractResolver {
  constructor(private readonly repository: B2BSalesCrmRepository) {}

  /**
   * El pactado en el caso si lo hay —y sólo si está activo y vigente—, o, si el caso no pactó
   * ninguno, la versión activa de la cuenta (lo que siempre se hizo). Un contrato pactado pero no
   * vigente NO cae al de la cuenta: sería activar con condiciones distintas de las que alguien
   * eligió a propósito.
   */
  async resolve(
    caseRecord: { accountId: string; contractVersionId: string | null },
    transaction?: Transaction,
  ): Promise<ContractVersionModel | null> {
    const today = new Date().toISOString().slice(0, 10);
    if (!caseRecord.contractVersionId) {
      return this.repository.findActiveContractVersion(caseRecord.accountId, today, transaction);
    }
    const version = await this.repository.contractVersions.findOne({
      where: { id: caseRecord.contractVersionId },
      include: [
        {
          model: this.repository.contracts,
          required: true,
          where: { accountId: caseRecord.accountId },
        },
      ],
      ...(transaction ? { transaction } : {}),
    });
    return version && isContractVersionActivatable(version, today) ? version : null;
  }

  /**
   * Por qué no hay contrato con el que activar, dicho en lo que el operador puede hacer.
   *
   * «Sin contrato activo» era cierto y engañoso a la vez cuando el contrato existía pero arrancaba
   * en el futuro: mandaba a crear uno que ya estaba. Aquí se distingue ese caso y se da la fecha.
   */
  async explainMissing(
    caseRecord: { accountId: string; contractVersionId: string | null },
    transaction?: Transaction,
  ): Promise<string> {
    if (caseRecord.contractVersionId) {
      return 'El contrato pactado para este alta no está activo ni vigente: fírmalo y actívalo, o pacta otro.';
    }
    const today = new Date().toISOString().slice(0, 10);
    const futuras = await this.repository.contractVersions.findAll({
      where: { status: 'ACTIVE', validFrom: { [Op.gt]: today } },
      include: [
        {
          model: this.repository.contracts,
          required: true,
          where: { accountId: caseRecord.accountId, status: 'ACTIVE' },
        },
      ],
      order: [['validFrom', 'ASC']],
      limit: 1,
      ...(transaction ? { transaction } : {}),
    });
    const proxima = futuras[0];
    return proxima
      ? `El contrato de esta cuenta aún no entra en vigor (desde ${proxima.validFrom}): espera esa fecha o ajusta la vigencia del contrato.`
      : 'No se puede activar comercio sin contrato activo.';
  }
}
