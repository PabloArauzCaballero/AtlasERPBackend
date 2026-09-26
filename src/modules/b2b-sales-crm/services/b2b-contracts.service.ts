import { nextDocumentNumber } from '../../../common/numbering/document-numbering';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op, Transaction, WhereOptions } from 'sequelize';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import {
  ApprovalStatus,
  ContractStatus,
  ContractVersionStatus,
  MDR_BELOW_MINIMUM_APPROVAL,
  OpportunityStage,
  ProposalStatus,
} from '../b2b-sales-crm.enums';
import type {
  CreateContractFromProposalDto,
  CreateMdrRuleDto,
  SignContractDto,
  UpdateMdrRuleDto,
} from '../b2b-sales-crm.dtos';
import { toContractVersionResponse } from '../b2b-sales-crm.mapper';
import { mdrRuleSpecificity } from '../domain/mdr-rule-specificity';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';

const MDR_RULE_EXCEPTION_REQUIRED =
  'La regla tiene una comisión menor al mínimo y requiere justificación de excepción.';

@Injectable()
export class B2BContractsService extends B2BSalesCrmUseCaseBase {
  constructor(repository: B2BSalesCrmRepository, logger: PinoLoggerService) {
    super(repository, logger);
  }

  async createContractFromProposal(
    input: CreateContractFromProposalDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'createContractFromProposal',
    });
    return this.repository.transaction(async (transaction) => {
      const proposal = await this.repository.findProposalWithLines(input.proposalId, transaction);

      if (!proposal) {
        throw new NotFoundException('Propuesta no encontrada.');
      }

      if (proposal.status !== ProposalStatus.ACCEPTED) {
        throw new ConflictException('Solo una propuesta aceptada puede convertirse en contrato.');
      }

      const existingContract = await this.repository.contracts.findOne({
        where: {
          opportunityId: proposal.opportunityId,
          status: { [Op.ne]: ContractStatus.TERMINATED },
        },
        transaction,
      });

      if (existingContract) {
        throw new ConflictException('La oportunidad ya tiene un contrato asociado.');
      }

      const contract = await this.repository.contracts.create(
        {
          accountId: proposal.accountId,
          opportunityId: proposal.opportunityId,
          contractNumber: await nextDocumentNumber(
            this.repository.sequelize,
            {
              prefix: 'CTR',
              table: 'atlas_sales.b2b_contracts',
              column: 'contract_number',
              date: input.startDate,
            },
            transaction,
          ),
          status: ContractStatus.PENDING_SIGNATURE,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          billingCycle: input.billingCycle,
          settlementPolicy: input.settlementPolicy,
        },
        { transaction },
      );

      const version = await this.repository.contractVersions.create(
        {
          contractId: contract.id,
          versionNumber: 1,
          validFrom: input.startDate,
          validTo: input.endDate ?? null,
          status: ContractVersionStatus.DRAFT,
          documentUrl: input.documentUrl ?? null,
        },
        { transaction },
      );

      for (const line of proposal.lines ?? []) {
        await this.repository.commercialTerms.create(
          {
            contractVersionId: version.id,
            termType: line.termType,
            description: line.description,
            ratePercent: line.ratePercent,
            fixedAmount: line.fixedAmount,
            currency: line.currency,
            billingTiming: line.billingTiming,
          },
          { transaction },
        );
      }

      await this.repository.opportunities.update(
        { stage: OpportunityStage.CLOSED_WON, updatedAt: new Date() },
        { where: { id: proposal.opportunityId }, transaction },
      );

      return {
        contract: {
          id: contract.id,
          accountId: contract.accountId,
          contractNumber: contract.contractNumber,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate,
        },
        version: toContractVersionResponse(version),
      };
    });
  }

  async signAndActivateContract(
    contractId: string,
    input: SignContractDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'signAndActivateContract',
    });
    return this.repository.transaction(async (transaction) => {
      const contract = await this.repository.contracts.findByPk(contractId, { transaction });

      if (!contract) {
        throw new NotFoundException('Contrato no encontrado.');
      }

      const version = await this.repository.contractVersions.findOne({
        where: { contractId, versionNumber: 1 },
        transaction,
      });

      if (!version) {
        throw new ConflictException('El contrato no tiene versión contractual inicial.');
      }

      await contract.update(
        { status: ContractStatus.ACTIVE, signedAt: input.signedAt ?? new Date() },
        { transaction },
      );
      await version.update(
        {
          status: ContractVersionStatus.ACTIVE,
          approvedByUserId: input.approvedByUserId,
          approvedAt: new Date(),
        },
        { transaction },
      );

      return {
        contractId: contract.id,
        status: contract.status,
        version: toContractVersionResponse(version),
      };
    });
  }
  /**
   * Las reglas de comision de una version contractual, ordenadas de la mas especifica a la general.
   *
   * Ese orden no es cosmetico: es EL orden en que el motor las elige. Enseñarlas al reves dejaria
   * creer que una regla general anula a una segmentada, que es exactamente lo contrario de lo que
   * pasa cuando llega la venta.
   */
  async listMdrRules(contractVersionId?: string): Promise<Record<string, unknown>[]> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'listMdrRules',
    });
    const rules = await this.repository.mdrRules.findAll({
      where: (contractVersionId ? { contractVersionId } : {}) as WhereOptions,
      order: [['created_at', 'DESC']],
      limit: 200,
    });

    return rules
      .map((regla) => ({
        id: regla.id,
        contractVersionId: regla.contractVersionId,
        ratePercent: regla.ratePercent,
        productCategory: regla.productCategory,
        branchId: regla.branchId,
        riskSegment: regla.riskSegment,
        minFeeAmount: regla.minFeeAmount,
        maxFeeAmount: regla.maxFeeAmount,
        isActive: regla.isActive,
        /* Cuanto pesa esta regla frente a las demas: es lo que decide cual gana. El peso de cada
           dimension es `MDR_DIMENSION_WEIGHT`, el MISMO con que el cobro elige la regla. */
        specificity: mdrRuleSpecificity(regla),
      }))
      .sort((a, b) => b.specificity - a.specificity);
  }

  /**
   * Crea una regla de comision.
   *
   * Las reglas son lo que de verdad se cobra, y el minimo global (`DEFAULT_MIN_MDR_RATE_PERCENT`) se
   * comprobaba SOLO al crear propuestas: una regla aceptaba cualquier tarifa de 0 a 100 sin nadie
   * que la firmara. Ahora una tarifa por debajo del minimo sigue el MISMO camino que en una
   * propuesta —motivo obligatorio (`pricingExceptionReason`) y solicitud `MDR_BELOW_MINIMUM` en la
   * cola de aprobaciones—, y la regla nace INACTIVA: no cobra hasta que alguien la apruebe.
   *
   * El contrato no guarda un minimo propio de la tarifa (sus terminos llevan la tarifa base y un
   * piso/techo en MONTO, no un piso en porcentaje), asi que el unico suelo es el global.
   */
  async createMdrRule(input: CreateMdrRuleDto, user: AuthUser): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'createMdrRule',
    });

    this.assertFeeFloorNotAboveCeiling(input.minFeeAmount, input.maxFeeAmount);

    const version = await this.repository.contractVersions.findByPk(input.contractVersionId);
    if (!version) throw new NotFoundException('Versión contractual no encontrada.');

    const belowMinimum = this.isBelowMdrMinimum(input.ratePercent);
    if (belowMinimum && !input.pricingExceptionReason) {
      throw new BadRequestException(MDR_RULE_EXCEPTION_REQUIRED);
    }

    return this.repository.transaction(async (transaction) => {
      const regla = await this.repository.mdrRules.create(
        {
          contractVersionId: input.contractVersionId,
          ratePercent: input.ratePercent,
          productCategory: input.productCategory ?? null,
          branchId: input.branchId ?? null,
          riskSegment: input.riskSegment ?? null,
          minFeeAmount: input.minFeeAmount ?? null,
          maxFeeAmount: input.maxFeeAmount ?? null,
          // Por debajo del minimo espera su aprobacion: una regla inactiva no se elige al cobrar.
          isActive: !belowMinimum,
        } as never,
        { transaction },
      );
      const approval = belowMinimum
        ? await this.requestMdrException(
            regla.id,
            input.contractVersionId,
            input.ratePercent,
            input.pricingExceptionReason ?? '',
            user,
            transaction,
          )
        : null;
      return {
        id: regla.id,
        ratePercent: regla.ratePercent,
        isActive: regla.isActive,
        ...(approval ? { approvalRequestId: approval.id } : {}),
      };
    });
  }

  /**
   * Edita o desactiva una regla. La segmentacion NO se cambia.
   *
   * Cambiar a que segmento aplica una regla existente reescribe en silencio como se cobro el pasado
   * cuando alguien audite por que una venta pago lo que pago. Para cobrar distinto a otro segmento
   * se crea otra regla; para dejar de cobrar asi, se desactiva esta.
   *
   * Piso <= techo se valida contra lo que la regla QUEDARIA: si llega solo uno de los dos, contra el
   * otro ya guardado. Con piso > techo el `clamp` del cobro devuelve siempre el techo.
   *
   * Pide excepcion (motivo + aprobacion `MDR_BELOW_MINIMUM`, como `createMdrRule`) cuando la regla
   * quedaria ACTIVA por debajo del minimo POR ESTA edicion: porque se le baja la tarifa, o porque se
   * la reactiva estando ya por debajo. En ese caso los cambios se guardan pero la regla queda
   * inactiva hasta que se apruebe, y mientras tanto no admite mas ediciones: lo que el aprobador
   * firma es lo que se activa, no algo que el solicitante pudo cambiar despues. Desactivar, o editar
   * los montos de una regla que no cambia de tarifa ni de estado, nunca pide excepcion.
   */
  async updateMdrRule(
    ruleId: string,
    input: UpdateMdrRuleDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BContractsService.name, 'B2B CRM use case started', {
      useCase: 'updateMdrRule',
    });
    const regla = await this.repository.mdrRules.findByPk(ruleId);
    if (!regla) throw new NotFoundException('Regla de comisión no encontrada.');

    const pending = await this.repository.approvalRequests.findOne({
      where: { mdrRuleId: regla.id, status: ApprovalStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException(
        'La regla espera la aprobación de una excepción de tarifa: no se modifica hasta que se decida.',
      );
    }

    const activates = input.isActive === true && !regla.isActive;
    if (input.minFeeAmount !== undefined || input.maxFeeAmount !== undefined || activates) {
      this.assertFeeFloorNotAboveCeiling(
        input.minFeeAmount !== undefined ? input.minFeeAmount : regla.minFeeAmount,
        input.maxFeeAmount !== undefined ? input.maxFeeAmount : regla.maxFeeAmount,
      );
    }

    const storedRate = this.toNumber(regla.ratePercent);
    const resultingRate = input.ratePercent ?? storedRate;
    const resultingActive = input.isActive ?? regla.isActive;
    const changesRate = input.ratePercent !== undefined && input.ratePercent !== storedRate;
    const needsException =
      resultingActive && this.isBelowMdrMinimum(resultingRate) && (changesRate || activates);

    if (needsException && !input.pricingExceptionReason) {
      throw new BadRequestException(MDR_RULE_EXCEPTION_REQUIRED);
    }

    const changes = {
      ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
      ...(input.minFeeAmount !== undefined ? { minFeeAmount: input.minFeeAmount } : {}),
      ...(input.maxFeeAmount !== undefined ? { maxFeeAmount: input.maxFeeAmount } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    if (!needsException) {
      await regla.update(changes);
      return { id: regla.id, ratePercent: regla.ratePercent, isActive: regla.isActive };
    }

    return this.repository.transaction(async (transaction) => {
      await regla.update({ ...changes, isActive: false }, { transaction });
      const approval = await this.requestMdrException(
        regla.id,
        regla.contractVersionId,
        resultingRate,
        input.pricingExceptionReason ?? '',
        user,
        transaction,
      );
      return {
        id: regla.id,
        ratePercent: regla.ratePercent,
        isActive: regla.isActive,
        approvalRequestId: approval.id,
      };
    });
  }

  /** Una tarifa por debajo del minimo global. Igual que en las propuestas: estrictamente menor. */
  private isBelowMdrMinimum(ratePercent: number): boolean {
    return ratePercent < env.DEFAULT_MIN_MDR_RATE_PERCENT;
  }

  /**
   * Piso <= techo. Los montos llegan como numero (cuerpo de la peticion) o como texto decimal (la
   * fila guardada), y `null` significa «sin limite»: sin uno de los dos no hay nada que comparar.
   */
  private assertFeeFloorNotAboveCeiling(
    floor: string | number | null | undefined,
    ceiling: string | number | null | undefined,
  ): void {
    if (floor === null || floor === undefined || ceiling === null || ceiling === undefined) {
      return;
    }
    if (this.toNumber(floor) > this.toNumber(ceiling)) {
      throw new ConflictException('El piso de la comisión no puede superar su techo.');
    }
  }

  /** La solicitud de excepcion: la misma que crea una propuesta, colgada de la REGLA. */
  private requestMdrException(
    ruleId: string,
    contractVersionId: string,
    ratePercent: number,
    reason: string,
    user: AuthUser,
    transaction: Transaction,
  ) {
    return this.repository.approvalRequests.create(
      {
        mdrRuleId: ruleId,
        contractVersionId,
        requestedByUserId: user.sub,
        approvalType: MDR_BELOW_MINIMUM_APPROVAL,
        // El aprobador ve la tarifa pedida junto al motivo: la cola no muestra la regla.
        reason: `Regla MDR al ${ratePercent} % (mínimo ${env.DEFAULT_MIN_MDR_RATE_PERCENT} %). ${reason}`,
        status: ApprovalStatus.PENDING,
      },
      { transaction },
    );
  }
}
