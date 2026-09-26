/**
 * Productor de `merchant.mdr.updated` hacia Core (T-10, plan `_plan-motor-decisiones-tasa-2026-09-25`).
 *
 * El ERP es la autoridad del término comercial pactado; Core sólo proyecta lo YA pactado en
 * `partner_profiles.mdr_rate_percent`, que es lo que el portal del comercio muestra. Se publica la
 * regla GENERAL del contrato (especificidad 0: sin sucursal, sin categoría, sin segmento de
 * riesgo) porque es la única que representa "la tarifa del comercio" como un número único — las
 * reglas segmentadas sólo aplican a una venta concreta, nunca son "la" tarifa a mostrar.
 *
 * Sin cuenta enlazada a Core (`partnerProfileId` nulo) o sin regla general activa, no hay nada que
 * publicar: no se inventa un número. `occurredAt` es el `effectiveAt` que Core usa para descartar
 * avisos tardíos o repetidos (ver `PartnerMdrProjection.applyMdrUpdate` en AtlasBackend).
 */
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import type { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

export async function publishMdrUpdatedForContractVersion(
  repository: B2BSalesCrmRepository,
  contractVersionId: string,
  occurredAt: Date,
  transaction: Transaction,
): Promise<void> {
  const version = await repository.contractVersions.findByPk(contractVersionId, { transaction });
  if (!version) return;
  const contract = await repository.contracts.findByPk(version.contractId, { transaction });
  if (!contract) return;
  const account = await repository.accounts.findByPk(contract.accountId, { transaction });
  if (!account?.partnerProfileId) return;

  const generalRule = await repository.mdrRules.findOne({
    where: {
      contractVersionId,
      isActive: true,
      branchId: { [Op.is]: null },
      productCategory: { [Op.is]: null },
      riskSegment: { [Op.is]: null },
    },
    transaction,
  });
  if (!generalRule) return;

  await repository.eventOutbox.create(
    {
      topic: 'merchant.mdr.updated',
      aggregateType: 'b2b_account',
      aggregateId: account.id,
      eventKey: `mdr-updated-${account.id}-${generalRule.id}-${occurredAt.getTime()}`,
      payload: {
        partnerProfileId: account.partnerProfileId,
        mdrRatePercent: Number(generalRule.ratePercent).toFixed(2),
        effectiveAt: occurredAt.toISOString(),
      },
    },
    { transaction },
  );
}
