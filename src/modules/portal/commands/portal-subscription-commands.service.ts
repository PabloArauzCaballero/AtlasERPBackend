import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  MerchantPlanModel,
  MerchantSubscriptionModel,
  MerchantUserModel,
} from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { computePeriodEnd } from '../../../common/time/billing-period.util';
import { PORTAL_MODULE_CODE, PORTAL_SUBSCRIBABLE_ACCOUNT_STATUSES } from '../portal.constants';
import { toSubscriptionDto, type PortalSubscriptionDto } from '../portal.mappers';
import type { PortalActor } from '../portal-actor';
import { PortalScopeService } from '../portal.scope.service';
import type { SubscribeDto } from '../portal.schemas';

/** La contratación de plan del comercio. */
@Injectable()
export class PortalSubscriptionCommandService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    private readonly scopeService: PortalScopeService,
    private readonly businessActionLogs: BusinessActionLogsService,
    @InjectModel(MerchantPlanModel) private readonly planModel: typeof MerchantPlanModel,
    @InjectModel(MerchantSubscriptionModel)
    private readonly subscriptionModel: typeof MerchantSubscriptionModel,
    @InjectModel(MerchantUserModel) private readonly merchantUserModel: typeof MerchantUserModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
  ) {}

  /**
   * Selección o cambio de plan.
   *
   * La cuenta se bloquea con `SELECT ... FOR UPDATE` durante toda la transacción: sin ese candado
   * dos peticiones concurrentes pasan ambas por el `UPDATE` de cierre sin ver filas y ambas
   * insertan, dejando el resultado a merced del índice único parcial (error de restricción crudo)
   * o, si el índice se cayera, dos suscripciones activas y doble cobro mensual.
   */
  async subscribe(input: SubscribeDto, actor: PortalActor): Promise<PortalSubscriptionDto> {
    const merchantAccountId = this.scopeService.resolveAccountId(
      actor.scope,
      input.merchantAccountId,
    );

    return this.sequelize.transaction(async (transaction) => {
      const account = await this.accountModel.findByPk(merchantAccountId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!account) {
        throw new NotFoundException({
          code: 'MERCHANT_ACCOUNT_NOT_FOUND',
          message: 'Cuenta merchant no encontrada.',
        });
      }
      if (
        !(PORTAL_SUBSCRIBABLE_ACCOUNT_STATUSES as readonly string[]).includes(
          account.lifecycleStatus,
        )
      ) {
        throw new ConflictException({
          code: 'MERCHANT_ACCOUNT_NOT_SUBSCRIBABLE',
          message: `Una cuenta en estado ${account.lifecycleStatus} no puede contratar planes.`,
        });
      }

      const plan = await this.planModel.findByPk(input.planId, { transaction });
      if (!plan || plan.status !== 'ACTIVE') {
        throw new NotFoundException({
          code: 'MERCHANT_PLAN_NOT_AVAILABLE',
          message: 'Plan no encontrado o inactivo.',
        });
      }

      const now = new Date();
      const actorId = await this.resolveActorUserId(actor.user.sub, transaction);
      const previous = await this.subscriptionModel.findOne({
        where: { merchantAccountId, status: 'ACTIVE' },
        transaction,
      });

      if (previous && previous.planId === input.planId && previous.autoRenew === input.autoRenew) {
        // Reintento idempotente: el comercio ya está en ese plan con la misma renovación.
        this.logger.infoContext(
          PortalSubscriptionCommandService.name,
          'Selección de plan sin cambios',
          {
            merchantAccountId,
            planId: input.planId,
            userId: actor.user.sub,
            requestId: actor.requestId,
          },
        );
        return this.loadSubscriptionDto(previous.id, transaction);
      }

      const closedCount = await this.subscriptionModel.update(
        { status: 'REPLACED', endedAt: now, endedByUserId: actorId, updatedAt: now },
        { where: { merchantAccountId, status: 'ACTIVE' }, transaction },
      );

      const subscription = await this.subscriptionModel.create(
        {
          merchantAccountId,
          planId: input.planId,
          status: 'ACTIVE',
          autoRenew: input.autoRenew,
          startedAt: now,
          currentPeriodEnd: computePeriodEnd(now),
          selectedByUserId: actorId,
          endedAt: null,
          endedByUserId: null,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_SUBSCRIPTION',
        actionCode: previous ? 'CHANGE_MERCHANT_PLAN' : 'SELECT_MERCHANT_PLAN',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_SUBSCRIPTION',
        aggregateId: subscription.id,
        correlationId: merchantAccountId,
        requestId: actor.requestId,
        affectedTables: ['atlas_sales.merchant_subscriptions'],
        affectedRecordCount: (closedCount[0] ?? 0) + 1,
        status: 'SUCCESS',
        inputSummary: {
          merchantAccountId,
          planId: input.planId,
          autoRenew: input.autoRenew,
          delegated: actor.scope.isInternalOperator,
        },
        outputSummary: {
          subscriptionId: subscription.id,
          previousSubscriptionId: previous?.id ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        },
        transaction,
      });

      this.logger.infoContext(PortalSubscriptionCommandService.name, 'Plan merchant contratado', {
        merchantAccountId,
        planId: input.planId,
        subscriptionId: subscription.id,
        replacedSubscriptions: closedCount[0] ?? 0,
        userId: actor.user.sub,
        requestId: actor.requestId,
      });

      return this.loadSubscriptionDto(subscription.id, transaction);
    });
  }

  private async loadSubscriptionDto(
    subscriptionId: string,
    transaction: Transaction,
  ): Promise<PortalSubscriptionDto> {
    const subscription = await this.subscriptionModel.findByPk(subscriptionId, {
      include: [{ model: MerchantPlanModel }],
      transaction,
    });
    const dto = toSubscriptionDto(subscription);
    if (!dto) {
      throw new NotFoundException({
        code: 'MERCHANT_SUBSCRIPTION_NOT_FOUND',
        message: 'No se pudo recuperar la suscripción recién registrada.',
      });
    }
    return dto;
  }

  /**
   * Traduce el principal del token al usuario de comercio DE ESTE backend.
   *
   * `selected_by_user_id` y `ended_by_user_id` son `uuid`, pero `user.sub` es el identificador
   * opaco que emite AtlasBackend —un bigint como `"9002"`—. Guardarlo tal cual reventaba el
   * INSERT y el comercio no podia cambiar de tarifa: la pantalla decia «Ocurrio un error al
   * consultar o modificar la base de datos», que no dice nada de lo que pasa.
   *
   * El enlace es `merchant_users.user_id`, que guarda ese `sub` como texto: es el mismo puente que
   * ya usa `PortalScopeService` para decidir a que comercio pertenece quien llama. Si no hay
   * reflejo —personal interno operando en nombre del comercio— se guarda `null`: es preferible no
   * saber quien fue a inventar un identificador que no apunta a nadie.
   */
  private async resolveActorUserId(sub: string, transaction: Transaction): Promise<string | null> {
    if (!sub) return null;
    const merchantUser = await this.merchantUserModel.findOne({
      where: { userId: String(sub) },
      transaction,
    });
    return merchantUser?.id ?? null;
  }
}
