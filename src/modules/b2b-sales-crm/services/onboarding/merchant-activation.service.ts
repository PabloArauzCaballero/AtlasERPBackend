import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import { AccountLifecycleStatus, BranchStatus, ChecklistStatus } from '../../b2b-sales-crm.enums';
import { ONBOARDING_TERMINAL_STATUS } from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { ActivationContractResolver } from './activation-contract.resolver';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** La activación del comercio: la compuerta dura del Motor, el checklist y el contrato, y habilitar sus sucursales. */
@Injectable()
export class MerchantActivationService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly activationContract: ActivationContractResolver,
    private readonly caseQuery: OnboardingCaseQueryService,
  ) {
    super(repository, logger);
  }

  async activateOnboardingCase(onboardingCaseId: string): Promise<Record<string, unknown>> {
    this.announce('activateOnboardingCase');
    return this.repository.transaction(async (transaction) => {
      const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, {
        include: [this.repository.checklistItems],
        transaction,
      });

      if (!caseRecord) {
        throw new NotFoundException('Caso de onboarding no encontrado.');
      }

      // Activar dos veces reescribiría `completedAt` y volvería a tocar sucursales ya activas: el
      // expediente diría que el comercio se habilitó hoy cuando lleva meses operando.
      if (caseRecord.status === ONBOARDING_TERMINAL_STATUS) {
        throw new ConflictException(
          'El comercio ya está activado: este caso es su expediente cerrado.',
        );
      }

      // Va PRIMERO porque es el tramo más lejano de la cadena: lo que falte aquí manda a otro
      // sistema, y hay que decirlo antes que un requisito que se cierra en esta misma pantalla.
      // Compuerta dura: sin APROBADO del Motor no se activa a nadie. Se corta aquí y no en la
      // pantalla porque una pantalla se salta con `curl`. Si el Motor está caído, el caso espera.
      if (caseRecord.decisionOutcome !== 'APROBADO') {
        throw new ConflictException(
          caseRecord.decisionOutcome
            ? `El Motor no aprobó este comercio (${caseRecord.decisionOutcome}): no se puede activar.`
            : 'Falta la verificación del Motor: pide la verificación del comercio antes de activarlo.',
        );
      }

      const items = caseRecord.checklistItems ?? [];
      if (
        items.length === 0 ||
        items.some(
          (item) =>
            item.status !== ChecklistStatus.COMPLETED && item.status !== ChecklistStatus.WAIVED,
        )
      ) {
        throw new ConflictException(
          'No se puede activar comercio con checklist pendiente o bloqueado.',
        );
      }

      const activeVersion = await this.activationContract.resolve(caseRecord, transaction);

      if (!activeVersion) {
        throw new ConflictException(
          caseRecord.contractVersionId
            ? 'El contrato pactado para este alta no está activo ni vigente: fírmalo y actívalo, o pacta otro.'
            : 'No se puede activar comercio sin contrato activo.',
        );
      }

      await caseRecord.update({ status: 'COMPLETED', completedAt: new Date() }, { transaction });
      await this.repository.accounts.update(
        { lifecycleStatus: AccountLifecycleStatus.CUSTOMER, updatedAt: new Date() },
        { where: { id: caseRecord.accountId }, transaction },
      );
      // Comercio aprobado = todas sus sucursales vigentes venden, salvo las que Atlas apagó a mano. Primero
      // las PENDING pasan a ACTIVE; luego se habilitan TODAS las ACTIVE sin la capacidad —las que ya lo
      // estaban incluidas: `setBranchStatus` las activa sin ella y una activación que sólo mirara las
      // PENDING las dejaba en «Por habilitar» para siempre—. No se toca `activatedAt` de las que ya tenían.
      await this.repository.branches.update(
        { status: BranchStatus.ACTIVE, activatedAt: new Date() },
        { where: { accountId: caseRecord.accountId, status: BranchStatus.PENDING }, transaction },
      );
      await this.repository.branches.update(
        { canOriginateBnpl: true },
        {
          where: {
            accountId: caseRecord.accountId,
            status: BranchStatus.ACTIVE,
            canOriginateBnpl: false,
            bnplBlockedByAtlas: false,
          },
          transaction,
        },
      );

      return this.caseQuery.getOnboardingCase(caseRecord.id, transaction);
    });
  }
}
