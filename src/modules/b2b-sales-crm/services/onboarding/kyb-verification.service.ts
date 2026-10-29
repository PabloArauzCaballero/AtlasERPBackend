import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { RequestKybReviewDto } from '../../b2b-sales-crm.dtos';
import type { AuthUser } from '../../../../common/types/auth-context.types';
import {
  ONBOARDING_TERMINAL_STATUS,
  STATUSES_THAT_CAN_REQUEST_KYB,
  STATUS_FOR_KYB_OUTCOME,
  type KybOutcome,
  normalizeKybOutcome,
} from '../../domain/onboarding-lifecycle';
import type { MerchantOnboardingCaseModel } from '../../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { BusinessActionLogsService } from '../../../business-action-logs/business-action-logs.service';
import { AtlasPartnerClient } from '../../../partner-onboarding-gateway/atlas-partner.client';
import { explainMissingAtlasPermission } from './atlas-permission-hint';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { OnboardingUseCase } from './onboarding-use-case.base';

/**
 * Lo que publica AtlasBackend al decidir el KYB. `evaluatedAt` es cuándo respondió el Motor; el
 * `decidedAt` del perfil significa otra cosa (cuándo quedó firme el expediente) y no se lee aquí.
 */
interface KybDecision {
  outcome: KybOutcome;
  reason: string | null;
  executionId: string | null;
  artifactVersionId: string | null;
  manualReviewCaseCode: string | null;
  evaluatedAt: string | null;
}

/** AtlasBackend responde 409 `PARTNER_NOT_UNDER_REVIEW` cuando el expediente ya salió de `under_review`. */
function esExpedienteYaDecidido(error: unknown): boolean {
  if (!(error instanceof ConflictException)) return false;
  return JSON.stringify(error.getResponse()).includes('PARTNER_NOT_UNDER_REVIEW');
}

/** La verificación del comercio (KYB): enlazar su expediente en Atlas, pedirla y traer el veredicto. */
@Injectable()
export class KybVerificationService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly partnerClient: AtlasPartnerClient,
    private readonly caseQuery: OnboardingCaseQueryService,
  ) {
    super(repository, logger);
  }

  /**
   * Enlazar el caso con el expediente del comercio en AtlasBackend (`partner_profiles`).
   *
   * El puente `partner_profiles.erp_account_id` va en el otro sentido y es nulable a propósito, y
   * el ERP no tenía nada que apuntara al expediente: no había a quién pedirle la verificación. Se
   * busca por `erpAccountId` y, si no, por NIT; al encontrarlo se guarda aquí y se escribe también
   * allá, para que la búsqueda por NIT sólo haga falta la primera vez. Un comercio SIN expediente es
   * un estado visible («sin expediente»), no un 500: el comercio tiene que abrirlo desde su portal.
   */
  async linkPartnerProfile(
    onboardingCaseId: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    this.announce('linkPartnerProfile');
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, {
      include: [this.repository.accounts],
    });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    const account = caseRecord.account;
    if (account.partnerProfileId) {
      return {
        id: caseRecord.id,
        partnerProfileId: account.partnerProfileId,
        linked: true,
        alreadyLinked: true,
      };
    }

    const encontrado = await this.findPartnerProfile(account.id, account.taxId, accessToken);
    if (!encontrado) {
      return {
        id: caseRecord.id,
        partnerProfileId: null,
        linked: false,
        reason: 'SIN_EXPEDIENTE_EN_ATLAS',
      };
    }

    if (encontrado.erpAccountId !== account.id) {
      // Se escribe el puente en AtlasBackend. Si ya apunta a OTRA cuenta, es un 409 de allá y se
      // deja pasar tal cual: dos cuentas del ERP reclamando el mismo expediente es un problema de
      // datos que hay que mirar, no que resolver a ciegas.
      await this.partnerClient.forward({
        method: 'PATCH',
        path: `operations/partners/${encodeURIComponent(encontrado.partnerId)}/erp-account`,
        accessToken,
        body: { erpAccountId: account.id },
      });
    }
    await account.update({ partnerProfileId: encontrado.partnerId });
    return {
      id: caseRecord.id,
      partnerProfileId: encontrado.partnerId,
      linked: true,
      onboardingStatus: encontrado.onboardingStatus,
    };
  }

  /**
   * Pedir al Motor la verificación del comercio. El ERP PIDE; decide AtlasBackend con el Motor.
   *
   * Nunca se llama al Motor directo: `POST /operations/partners/:partnerId/kyb-review` es el ÚNICO
   * origen de esa decisión (el autoservicio del comercio pasa por la misma función). El caso queda
   * EN_VERIFICACION antes de llamar; si AtlasBackend responde 503 porque el Motor no está, el caso
   * se queda ahí con el error visible: **nunca se aprueba solo**.
   */
  async requestKybReview(
    onboardingCaseId: string,
    input: RequestKybReviewDto,
    accessToken: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.announce('requestKybReview');
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, {
      include: [this.repository.accounts],
    });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (!STATUSES_THAT_CAN_REQUEST_KYB.includes(caseRecord.status as never)) {
      throw new ConflictException(
        `El caso está en ${caseRecord.status}: la verificación ya se pidió o ya no aplica.`,
      );
    }

    let partnerId = caseRecord.account.partnerProfileId;
    if (!partnerId) {
      const enlace = await this.linkPartnerProfile(onboardingCaseId, accessToken);
      partnerId = (enlace.partnerProfileId as string | null) ?? null;
    }
    if (!partnerId) {
      throw new ConflictException(
        'Este comercio no tiene expediente en Atlas: tiene que abrirlo desde su portal antes de que se pueda verificar.',
      );
    }

    const estadoPrevio = caseRecord.status;
    await caseRecord.update({ status: 'EN_VERIFICACION' });
    let respuesta: { partnerId: string; onboardingStatus: string; decision: KybDecision };
    try {
      respuesta = await this.partnerClient.forward<typeof respuesta>({
        method: 'POST',
        path: `operations/partners/${encodeURIComponent(partnerId)}/kyb-review`,
        accessToken,
        body: input.reason ? { reason: input.reason } : {},
      });
    } catch (error) {
      // Sin veredicto no hay verificación en curso. Dejar el caso EN_VERIFICACION tras un 503 lo
      // convertía en un callejón sin salida: sin veredicto que sincronizar y sin botón para volver
      // a pedir. El caso vuelve a donde estaba y el error se ve entero; nunca se aprueba solo.
      await caseRecord.update({ status: estadoPrevio });
      // El expediente ya se decidió en Atlas sin que el ERP lo pidiera (el autoservicio del comercio
      // disparó el KYB antes y un analista lo resolvió en el Motor). Pedirlo otra vez es imposible
      // —`PARTNER_NOT_UNDER_REVIEW`— y el caso quedaba `OPEN` sin salida: «Actualizar verificación»
      // sólo se ofrece EN_VERIFICACION. Lo que el operador quiere es el veredicto, y ese existe.
      if (esExpedienteYaDecidido(error)) {
        const traido = await this.syncKybDecision(onboardingCaseId, accessToken);
        if (traido.changed || traido.decisionOutcome) {
          return this.caseQuery.getOnboardingCase(onboardingCaseId);
        }
      }
      throw explainMissingAtlasPermission(error, 'partner.kyb.request');
    }

    await this.applyKybDecision(caseRecord, respuesta.decision);
    await this.businessActionLogsService.record({
      moduleCode: 'B2B_SALES_CRM',
      businessProcess: 'MERCHANT_ONBOARDING',
      actionCode: 'REQUEST_KYB_REVIEW',
      actorUserId: actor.sub,
      actorRole: actor.role ?? null,
      aggregateType: 'MERCHANT_ONBOARDING_CASE',
      aggregateId: caseRecord.id,
      affectedTables: ['atlas_sales.merchant_onboarding_cases'],
      affectedRecordCount: 1,
      status: 'SUCCESS',
      inputSummary: { partnerId, reason: input.reason ?? null },
      outputSummary: { ...respuesta.decision },
    });
    return this.caseQuery.getOnboardingCase(onboardingCaseId);
  }

  /**
   * Traer el desenlace vigente del expediente: lo que resolvió el caso de revisión manual del Motor
   * (lo aplica un job de AtlasBackend) o una decisión que el autoservicio disparó por su cuenta.
   */
  async syncKybDecision(
    onboardingCaseId: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    this.announce('syncKybDecision');
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, {
      include: [this.repository.accounts],
    });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    const partnerId = caseRecord.account.partnerProfileId;
    if (!partnerId) {
      return {
        id: caseRecord.id,
        status: caseRecord.status,
        decisionOutcome: caseRecord.decisionOutcome,
        changed: false,
        reason: 'SIN_EXPEDIENTE_EN_ATLAS',
      };
    }
    // En `status` el bloque `decision` viaja dentro de `profile` (AtlasBackend, 2026-09-08).
    const estado = await this.partnerClient.forward<{
      profile?: { decision?: KybDecision | null } | null;
    }>({
      method: 'GET',
      path: `partner-onboarding/${encodeURIComponent(partnerId)}/status`,
      accessToken,
    });
    const decision = estado.profile?.decision ?? null;
    const changed = decision?.outcome ? await this.applyKybDecision(caseRecord, decision) : false;
    return {
      id: caseRecord.id,
      status: caseRecord.status,
      decisionOutcome: caseRecord.decisionOutcome,
      changed,
    };
  }

  /** Aplica lo que publicó el Motor. Devuelve si el caso cambió. No reabre un caso ya activado. */
  private async applyKybDecision(
    caseRecord: MerchantOnboardingCaseModel,
    decision: KybDecision,
  ): Promise<boolean> {
    if (caseRecord.status === ONBOARDING_TERMINAL_STATUS) return false;
    const mismo =
      caseRecord.decisionExecutionId === decision.executionId &&
      caseRecord.decisionOutcome === normalizeKybOutcome(decision.outcome) &&
      caseRecord.manualReviewCaseCode === (decision.manualReviewCaseCode ?? null);
    if (mismo) return false;

    const outcome = normalizeKybOutcome(decision.outcome);
    const siguiente = STATUS_FOR_KYB_OUTCOME[outcome];
    // Un APROBADO tardío (revisión manual resuelta) no retrocede un caso que ya fue más lejos.
    const conservar =
      siguiente === 'VERIFICADO' && ['ALTA_PENDIENTE', 'LISTO'].includes(caseRecord.status);
    await caseRecord.update({
      decisionOutcome: outcome,
      decisionReason:
        outcome === decision.outcome
          ? (decision.reason ?? null)
          : `DESENLACE_DESCONOCIDO:${decision.outcome || 'vacio'}`,
      decisionExecutionId: decision.executionId ?? null,
      decisionArtifactVersion: decision.artifactVersionId ?? null,
      manualReviewCaseCode: decision.manualReviewCaseCode ?? null,
      decidedAt: decision.evaluatedAt ? new Date(decision.evaluatedAt) : new Date(),
      ...(conservar ? {} : { status: siguiente }),
    });
    return true;
  }

  private async findPartnerProfile(
    erpAccountId: string,
    taxId: string | null,
    accessToken: string,
  ): Promise<{ partnerId: string; onboardingStatus: string; erpAccountId: string | null } | null> {
    type Fila = { partnerId: string; onboardingStatus: string; erpAccountId: string | null };
    const porCuenta = await this.partnerClient.forward<{ items: Fila[] }>({
      method: 'GET',
      path: `operations/partners?erpAccountId=${encodeURIComponent(erpAccountId)}`,
      accessToken,
    });
    if (porCuenta.items?.[0]) return porCuenta.items[0];
    if (!taxId) return null;
    const porNit = await this.partnerClient.forward<{ items: Fila[] }>({
      method: 'GET',
      path: `operations/partners?taxId=${encodeURIComponent(taxId)}`,
      accessToken,
    });
    return porNit.items?.[0] ?? null;
  }
}
