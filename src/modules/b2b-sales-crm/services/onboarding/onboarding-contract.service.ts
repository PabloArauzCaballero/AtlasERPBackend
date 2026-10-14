import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { AssignCaseContractDto, CreateCaseMdrRuleDto } from '../../b2b-sales-crm.dtos';
import type { AuthUser } from '../../../../common/types/auth-context.types';
import { ONBOARDING_TERMINAL_STATUS } from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { AtlasPartnerClient } from '../../../partner-onboarding-gateway/atlas-partner.client';
import { B2BContractsService } from '../b2b-contracts.service';
import { isContractVersionActivatable } from './activation-contract.resolver';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** El contrato del alta: cuál se pacta para el caso y cuál es el texto legal por defecto de Atlas. */
@Injectable()
export class OnboardingContractService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly partnerClient: AtlasPartnerClient,
    private readonly caseQuery: OnboardingCaseQueryService,
    private readonly contracts: B2BContractsService,
  ) {
    super(repository, logger);
  }

  /**
   * Las versiones de contrato entre las que se puede elegir para ESTE caso: las de los contratos
   * de su misma cuenta. Se etiquetan con lo que decide si sirven para activar —estado y vigencia—
   * para que quien elige vea por qué una no va a pasar.
   */
  async listCaseContractOptions(onboardingCaseId: string): Promise<Record<string, unknown>[]> {
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');

    const versions = await this.repository.contractVersions.findAll({
      include: [
        {
          model: this.repository.contracts,
          required: true,
          where: { accountId: caseRecord.accountId },
        },
      ],
      order: [
        ['validFrom', 'DESC'],
        ['versionNumber', 'DESC'],
      ],
    });
    const today = new Date().toISOString().slice(0, 10);
    return versions.map((version) => ({
      id: version.id,
      contractId: version.contractId,
      contractNumber: version.contract?.contractNumber ?? null,
      contractStatus: version.contract?.status ?? null,
      versionNumber: version.versionNumber,
      status: version.status,
      validFrom: version.validFrom,
      validTo: version.validTo,
      vigente: isContractVersionActivatable(version, today),
      selected: version.id === caseRecord.contractVersionId,
    }));
  }

  /**
   * Pactar el contrato del alta. Sólo uno de la MISMA cuenta: colgar el caso de un contrato ajeno
   * activaría a un comercio con las condiciones de otro, y el 404 lo dice como lo que es.
   */
  async assignCaseContract(
    onboardingCaseId: string,
    input: AssignCaseContractDto,
  ): Promise<Record<string, unknown>> {
    this.announce('assignCaseContract');
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (caseRecord.status === ONBOARDING_TERMINAL_STATUS) {
      throw new ConflictException(
        'El comercio ya está activado: el contrato del alta no se cambia sobre un expediente cerrado.',
      );
    }

    const version = await this.repository.contractVersions.findOne({
      where: { id: input.contractVersionId },
      include: [
        {
          model: this.repository.contracts,
          required: true,
          where: { accountId: caseRecord.accountId },
        },
      ],
    });
    if (!version) {
      throw new NotFoundException('Esa versión de contrato no existe o no es de este comercio.');
    }

    await caseRecord.update({ contractVersionId: version.id });
    return this.caseQuery.getOnboardingCase(onboardingCaseId);
  }

  /** La versión de contrato del caso, exigida: sin ella no hay de dónde colgar una comisión. */
  async requireCaseContractVersionId(onboardingCaseId: string): Promise<string> {
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (!caseRecord.contractVersionId) {
      throw new ConflictException(
        'Este caso no tiene contrato pactado: asigna el contrato antes de la comisión.',
      );
    }
    return caseRecord.contractVersionId;
  }

  /**
   * El contrato legal POR DEFECTO del inquilino, tal como lo publica el portal interno de Atlas.
   *
   * No es el contrato comercial del caso (ese es `contract_version_id`, del ERP): es el texto legal
   * que Atlas exige tener vigente para que el Motor apruebe (`kyb_contrato_legal_vigente`). El ERP
   * sólo lo LEE, para decir en la cola cuál rige o que no hay ninguno; publicarlo o cambiarlo es del
   * portal. `null` no es error: un inquilino recién abierto todavía no tiene contrato.
   */
  async getDefaultLegalContractTemplate(accessToken: string): Promise<Record<string, unknown>> {
    const respuesta = await this.partnerClient.forward<{
      template: {
        templateId: string;
        templateCode: string;
        name: string;
        version: number;
        status: string;
        isDefault: boolean;
      } | null;
    }>({
      method: 'GET',
      path: 'operations/partner-contract-templates/default',
      accessToken,
    });
    const plantilla = respuesta.template;
    return {
      template: plantilla
        ? {
            templateId: plantilla.templateId,
            templateCode: plantilla.templateCode,
            name: plantilla.name,
            version: plantilla.version,
            status: plantilla.status,
          }
        : null,
    };
  }

  /**
   * La comisión del alta cuelga del contrato DEL CASO: se resuelve aquí y se crea con la misma
   * regla que cualquier otra regla de comisión, para que no haya dos formas de pactarla.
   */
  async createCaseMdrRule(
    onboardingCaseId: string,
    input: CreateCaseMdrRuleDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const contractVersionId = await this.requireCaseContractVersionId(onboardingCaseId);
    return this.contracts.createMdrRule({ ...input, contractVersionId }, user);
  }
}
