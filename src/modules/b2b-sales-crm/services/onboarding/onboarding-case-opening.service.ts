import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import { NIT_VALIDO } from '../../b2b-sales-crm.schemas';
import { ChecklistStatus, OpportunityStage } from '../../b2b-sales-crm.enums';
import type { CreateOnboardingCaseDto } from '../../b2b-sales-crm.dtos';
import {
  type AccountDossierFields,
  describirFaltantes,
  faltantesDelExpediente,
} from '../../domain/expediente-del-comercio';
import { ONBOARDING_OPEN_STATUSES } from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { MerchantFolderService } from '../../../partner-onboarding-gateway/merchant-folder.service';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { OnboardingUseCase } from './onboarding-use-case.base';

@Injectable()
export class OnboardingCaseOpeningService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly merchantFolder: MerchantFolderService,
    private readonly caseQuery: OnboardingCaseQueryService,
  ) {
    super(repository, logger);
  }

  /**
   * Abre el caso y, ya confirmado, asegura la carpeta del comercio en Atlas.
   *
   * La carpeta (Operaciones › Archivos, con `documentos/`) tiene que existir desde el onboarding
   * (Pablo, 2026-09-26): ahí caen el contrato firmado y lo que el ERP guarde del comercio. Va
   * DESPUÉS de la transacción y sin poder tumbarla: el caso vale aunque Atlas no conteste, y el
   * desenlace viaja en `carpetaDelComercio` para que la pantalla lo diga.
   */
  async createOnboardingCase(
    input: CreateOnboardingCaseDto,
    accessToken?: string,
  ): Promise<Record<string, unknown>> {
    const caso = await this.openOnboardingCase(input);
    const carpeta = await this.merchantFolder.tryEnsureForAccount(input.accountId, accessToken);
    if (carpeta.partnerId && !carpeta.reason) {
      // El puente hacia la ficha de Atlas: sin él, la verificación KYB tendría que volver a buscarla.
      await this.repository.accounts.update(
        { partnerProfileId: carpeta.partnerId },
        { where: { id: input.accountId, partnerProfileId: null } },
      );
    }
    return { ...caso, carpetaDelComercio: carpeta };
  }

  private async openOnboardingCase(
    input: CreateOnboardingCaseDto,
  ): Promise<Record<string, unknown>> {
    this.announce('createOnboardingCase');
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(input.accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
      }
      await this.assertAccountReadyForFolder(account, transaction);

      // El onboarding es el último paso del embudo: sin una oportunidad ganada (contrato firmado)
      // se saltaría la calificación, la oportunidad y la contratación que lo preceden.
      const ganadas = await this.repository.opportunities.count({
        where: { accountId: input.accountId, stage: OpportunityStage.CLOSED_WON },
        transaction,
      });
      if (ganadas === 0) {
        throw new ConflictException(
          'Este comercio no tiene una oportunidad ganada: cierra la venta con contrato firmado antes de iniciar el onboarding.',
        );
      }

      const existingOpenCase = await this.repository.onboardingCases.findOne({
        where: {
          accountId: input.accountId,
          status: { [Op.in]: [...ONBOARDING_OPEN_STATUSES] },
        },
        transaction,
      });

      if (existingOpenCase) {
        throw new ConflictException('La cuenta ya tiene un caso de onboarding abierto.');
      }

      const caseRecord = await this.repository.onboardingCases.create(
        {
          accountId: input.accountId,
          ownerUserId: input.ownerUserId,
          status: 'OPEN',
        },
        { transaction },
      );

      for (const item of input.checklistItems) {
        await this.repository.checklistItems.create(
          {
            onboardingCaseId: caseRecord.id,
            itemType: item.itemType,
            description: item.description,
            status: ChecklistStatus.PENDING,
          },
          { transaction },
        );
      }

      return this.caseQuery.getOnboardingCase(caseRecord.id, transaction);
    });
  }

  /**
   * Lo que Atlas exige para abrir la carpeta del comercio, comprobado ANTES de abrir el caso.
   *
   * La carpeta se intenta después del caso y sin poder tumbarlo, así que una cuenta sin NIT abría el
   * onboarding y se quedaba sin carpeta: el contrato firmado y la evidencia no aparecían en Archivos
   * y sólo lo decía un aviso (Pablo, 2026-09-28). La regla es la misma que aplica Atlas.
   */
  private async assertAccountReadyForFolder(
    account: { id: string; taxId: string | null; legalName: string } & AccountDossierFields,
    transaction: Transaction,
  ): Promise<void> {
    const faltan: string[] = [];
    if (!NIT_VALIDO.test(account.taxId?.trim() ?? '')) {
      faltan.push('el NIT (7 a 15 dígitos, sin puntos ni guiones)');
    }
    if ((account.legalName?.trim().length ?? 0) < 3) faltan.push('la razón social');
    const conCorreo = await this.repository.contacts.count({
      where: { accountId: account.id, email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
      transaction,
    });
    if (!conCorreo) faltan.push('un contacto con correo');
    /*
     * Y lo que el expediente exige para enviarse a revisión (Pablo, 2026-10-02): se pide UNA vez,
     * aquí, y llega hecho al portal del comercio. Sin esto el caso se abría igual y el expediente
     * nacía con «Falta 4 requisitos», que el comercio tenía que rellenar por segunda vez.
     */
    const delExpediente = faltantesDelExpediente(account);
    if (delExpediente.length) faltan.push(describirFaltantes(delExpediente));
    if (faltan.length) {
      throw new UnprocessableEntityException(
        `No se puede abrir el onboarding: a la cuenta le falta ${faltan.join(' y ')}. Sin eso el expediente del comercio nace incompleto. Complételo en la cuenta (Datos del expediente) y vuelva a intentarlo.`,
      );
    }
  }
}
