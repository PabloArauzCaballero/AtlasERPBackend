import { Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../../common/types/auth-context.types';
import {
  ONBOARDING_OPEN_STATUSES,
  ONBOARDING_TERMINAL_STATUS,
  summarizeCredentials,
} from '../../domain/onboarding-lifecycle';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import { AtlasIdentityClient } from '../../../auth-gateway/atlas-identity.client';
import { KybVerificationService } from './kyb-verification.service';
import { MerchantCredentialsReader } from './merchant-credentials.reader';
import { applyProvisioningResult } from './merchant-user-provisioning';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** El acuse de lo que el alta espera de otros sistemas: el veredicto del Motor y las credenciales del portal. */
@Injectable()
export class OnboardingReconciliationService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly identityClient: AtlasIdentityClient,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly kyb: KybVerificationService,
    private readonly credentials: MerchantCredentialsReader,
  ) {
    super(repository, logger);
  }

  /**
   * Acusar de una vez todo lo que espera a otro sistema.
   *
   * La cola lanzaba un acuse POR FILA al abrirse: con decenas de casos eran decenas de llamadas por
   * carga. Aquí es una: se recorren los casos abiertos que esperan al portal (credenciales
   * pendientes) o al Motor (EN_VERIFICACION, REVISION_MANUAL), con un tope, y cada uno se acusa
   * por separado para que el fallo de uno —un expediente sin enlazar, Atlas caído— no impida acusar
   * los demás. El ERP no tiene planificador; cuando lo tenga, esto es lo que correrá el job.
   */
  async reconcilePendingCases(
    accessToken: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.announce('reconcilePendingCases');
    const TOPE = 50;
    const abiertos = await this.repository.onboardingCases.findAll({
      where: { status: { [Op.in]: [...ONBOARDING_OPEN_STATUSES] } },
      order: [['startedAt', 'ASC']],
      limit: TOPE,
    });
    const credenciales = await this.credentials.byAccount(abiertos.map((row) => row.accountId));

    let revisados = 0;
    let cambiados = 0;
    const errores: Array<{ id: string; error: string }> = [];
    for (const caso of abiertos) {
      const esperaPortal = (credenciales.get(caso.accountId) ?? []).some(
        (u) => u.identityRequestId && u.status === 'INVITED' && !u.userId,
      );
      const esperaMotor = caso.status === 'EN_VERIFICACION' || caso.status === 'REVISION_MANUAL';
      if (!esperaPortal && !esperaMotor) continue;
      revisados += 1;
      try {
        if (esperaMotor) {
          const r = await this.kyb.syncKybDecision(caso.id, accessToken);
          if (r.changed) cambiados += 1;
        }
        if (esperaPortal) {
          const r = await this.reconcileCaseIdentity(caso.id, accessToken, actor);
          if (Array.isArray(r.resueltos) && r.resueltos.length > 0) cambiados += 1;
        }
      } catch (error) {
        errores.push({
          id: caso.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { revisados, cambiados, errores, tope: TOPE };
  }

  /**
   * El acuse que antes no llegaba nunca.
   *
   * AtlasBackend no llama de vuelta al ERP —no hay entrada pensada para eso y abrirla añadiría una
   * superficie más que proteger—, así que el ERP PREGUNTA: por cada usuario del comercio con
   * petición encolada y sin resolver, lee en qué quedó y lo aplica. Cuando todas las pedidas están
   * resueltas y al menos una concedida, el caso pasa a LISTO y queda `identity_acknowledged_at`,
   * que es lo que la fila enseña como «credenciales concedidas». Se llama al abrir la cola y desde
   * la fila; es idempotente, y deja huella en `business_action_logs` sólo cuando algo cambió.
   */
  async reconcileCaseIdentity(
    onboardingCaseId: string,
    accessToken: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.announce('reconcileCaseIdentity');
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');

    const users = await this.repository.merchantUsers.findAll({
      where: { accountId: caseRecord.accountId, identityRequestId: { [Op.ne]: null } },
    });
    const pendientes = users.filter((user) => user.status === 'INVITED' && !user.userId);

    const resueltos: Array<{
      id: string;
      email: string;
      status: string;
      identityStatus: string;
      rejectionReason: string | null;
    }> = [];
    for (const user of pendientes) {
      const request = await this.identityClient.getMerchantUserProvisioning(
        accessToken,
        String(user.identityRequestId),
      );
      const cambio = await applyProvisioningResult(user, request);
      if (cambio) {
        resueltos.push({
          id: user.id,
          email: user.email,
          status: user.status,
          identityStatus: request.status,
          rejectionReason: request.rejectionReason ?? null,
        });
      }
    }

    const summary = summarizeCredentials(users);
    const todasResueltas =
      summary.pedidas > 0 && summary.pendientes === 0 && summary.concedidas > 0;
    let acuse = caseRecord.identityAcknowledgedAt;
    if (todasResueltas && !acuse && caseRecord.status !== ONBOARDING_TERMINAL_STATUS) {
      acuse = new Date();
      await caseRecord.update({
        identityAcknowledgedAt: acuse,
        ...(caseRecord.status === 'ALTA_PENDIENTE' ? { status: 'LISTO' } : {}),
      });
    }

    if (resueltos.length > 0) {
      await this.businessActionLogsService.record({
        moduleCode: 'B2B_SALES_CRM',
        businessProcess: 'MERCHANT_ONBOARDING',
        actionCode: 'ACKNOWLEDGE_MERCHANT_CREDENTIALS',
        actorUserId: actor.sub,
        actorRole: actor.role ?? null,
        aggregateType: 'MERCHANT_ONBOARDING_CASE',
        aggregateId: caseRecord.id,
        affectedTables: ['atlas_sales.merchant_users', 'atlas_sales.merchant_onboarding_cases'],
        affectedRecordCount: resueltos.length + (acuse && todasResueltas ? 1 : 0),
        status: 'SUCCESS',
        outputSummary: { resueltos, credenciales: summary, acusadoEn: acuse },
      });
    }

    return {
      id: caseRecord.id,
      status: caseRecord.status,
      identityAcknowledgedAt: acuse,
      ...this.credentials.describe(users),
      resueltos,
    };
  }
}
