import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { MerchantPlanModel } from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { normalizeAmount, toMinorUnits } from '../../../common/money/decimal-amount.util';
import { PORTAL_MODULE_CODE } from '../portal.constants';
import { toPlanDto, type PortalPlanDto } from '../portal.mappers';
import type { PortalActor } from '../portal-actor';
import type { CreatePlanDto, UpdatePlanDto } from '../portal.schemas';

/**
 * Precio de vitrina -> micros.
 *
 * Los micros no son un capricho: un CPM de Bs 2,50 repartido entre mil impresiones es Bs 0,0025
 * por impresión, y en decimales de dos posiciones eso se redondea a cero mil veces seguidas y la
 * campaña no gasta nunca. La conversión pasa por `toMinorUnits`, que trabaja sobre el texto del
 * número, para no arrastrar el error de coma flotante de `precio * 1_000_000`.
 */
function toTariffMicros(price: number): string {
  return toMinorUnits(price.toFixed(6), 6).toString();
}

/** El pricing de la plataforma: alta de planes y cambio de tarifa, con su rastro en la bitácora. */
@Injectable()
export class PortalPlanCommandService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    private readonly businessActionLogs: BusinessActionLogsService,
    @InjectModel(MerchantPlanModel) private readonly planModel: typeof MerchantPlanModel,
  ) {}

  /**
   * Alta de un plan comercial. Es dato maestro de precio: se valida la unicidad del código antes
   * de insertar para devolver un conflicto de dominio en vez de un error de restricción, y queda
   * registrado en la bitácora de acciones de negocio.
   */
  async createPlan(input: CreatePlanDto, actor: PortalActor): Promise<PortalPlanDto> {
    return this.sequelize.transaction(async (transaction) => {
      const existing = await this.planModel.findOne({
        where: { code: input.code },
        transaction,
      });
      if (existing) {
        throw new ConflictException({
          code: 'MERCHANT_PLAN_CODE_TAKEN',
          message: `Ya existe un plan con el código ${input.code}.`,
        });
      }

      const plan = await this.planModel.create(
        {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          tier: input.tier,
          monthlyPrice: normalizeAmount(input.monthlyPrice),
          cpmMicros: toTariffMicros(input.cpmPrice),
          cpcMicros: toTariffMicros(input.cpcPrice),
          currency: input.currency,
          features: input.features,
          status: 'ACTIVE',
          sortOrder: input.sortOrder,
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_PLAN_ADMINISTRATION',
        actionCode: 'CREATE_MERCHANT_PLAN',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_PLAN',
        aggregateId: plan.id,
        requestId: actor.requestId,
        affectedTables: ['atlas_sales.merchant_plans'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: {
          code: input.code,
          tier: input.tier,
          cpmMicros: toTariffMicros(input.cpmPrice),
          cpcMicros: toTariffMicros(input.cpcPrice),
          currency: input.currency,
        },
        outputSummary: { planId: plan.id },
        transaction,
      });

      this.logger.infoContext(PortalPlanCommandService.name, 'Plan merchant creado', {
        planId: plan.id,
        code: input.code,
        userId: actor.user.sub,
        requestId: actor.requestId,
      });

      return toPlanDto(plan);
    });
  }

  /**
   * Cambio de tarifa. Es el pricing de la plataforma, así que el rastro importa tanto como el dato.
   *
   * Se registra el ANTES y el DESPUÉS de los dos precios en la bitácora de acciones de negocio: una
   * tarifa que baja de Bs 4,00 a Bs 2,50 el millar cambia lo que se le factura a cada comercio
   * suscrito desde el siguiente evento servido, y sin el valor anterior no hay forma de explicar
   * una factura pasada. Las suscripciones NO se tocan: apuntan al plan, no a una copia del precio,
   * y por eso el cambio alcanza a quien ya lo tenía contratado.
   */
  async updatePlan(
    planId: string,
    input: UpdatePlanDto,
    actor: PortalActor,
  ): Promise<PortalPlanDto> {
    return this.sequelize.transaction(async (transaction) => {
      const plan = await this.planModel.findByPk(planId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!plan) {
        throw new NotFoundException({
          code: 'MERCHANT_PLAN_NOT_FOUND',
          message: 'La tarifa indicada no existe.',
        });
      }

      const before = {
        cpmMicros: String(plan.cpmMicros ?? '0'),
        cpcMicros: String(plan.cpcMicros ?? '0'),
        status: plan.status,
        tier: plan.tier,
        currency: plan.currency,
      };

      const changes: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) changes.name = input.name;
      if (input.description !== undefined) changes.description = input.description ?? null;
      if (input.tier !== undefined) changes.tier = input.tier;
      if (input.monthlyPrice !== undefined) {
        changes.monthlyPrice = normalizeAmount(input.monthlyPrice);
      }
      if (input.cpmPrice !== undefined) changes.cpmMicros = toTariffMicros(input.cpmPrice);
      if (input.cpcPrice !== undefined) changes.cpcMicros = toTariffMicros(input.cpcPrice);
      if (input.currency !== undefined) changes.currency = input.currency;
      if (input.features !== undefined) changes.features = input.features;
      if (input.status !== undefined) changes.status = input.status;
      if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;

      await plan.update(changes, { transaction });

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_PLAN_ADMINISTRATION',
        actionCode: 'UPDATE_MERCHANT_PLAN_TARIFF',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_PLAN',
        aggregateId: plan.id,
        requestId: actor.requestId,
        affectedTables: ['atlas_sales.merchant_plans'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { code: plan.code, before },
        outputSummary: {
          planId: plan.id,
          after: {
            cpmMicros: String(plan.cpmMicros ?? '0'),
            cpcMicros: String(plan.cpcMicros ?? '0'),
            status: plan.status,
            tier: plan.tier,
            currency: plan.currency,
          },
        },
        transaction,
      });

      this.logger.infoContext(PortalPlanCommandService.name, 'Tarifa de plan actualizada', {
        planId: plan.id,
        code: plan.code,
        userId: actor.user.sub,
        requestId: actor.requestId,
      });

      return toPlanDto(plan);
    });
  }
}
