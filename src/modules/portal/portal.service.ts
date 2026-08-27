import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  B2BAccountModel,
  BillingProductModel,
  MerchantBranchModel,
  MerchantInvoiceModel,
  MerchantPlanModel,
  MerchantReceivableModel,
  MerchantSubscriptionModel,
  MerchantUserModel,
} from '../b2b-sales-crm/models/b2b-sales-crm.models';
import { AdvertiserAccountModel, CampaignModel } from '../ads/models';
import { AdsAuditService } from '../ads/services/audit.service';
import { assertCampaignTransition } from '../ads/ads.campaign-transitions';
import { BusinessActionLogsService } from '../business-action-logs/business-action-logs.service';
import { PinoLoggerService } from '../../common/logging/pino-logger.service';
import { computePeriodEnd } from '../../common/time/billing-period.util';
import { normalizeAmount, toMinorUnits } from '../../common/money/decimal-amount.util';
import type { AuthUser } from '../../common/types/auth-context.types';
import {
  PORTAL_BILLING_DOCUMENT_LIMIT,
  PORTAL_MODULE_CODE,
  PORTAL_SUBSCRIBABLE_ACCOUNT_STATUSES,
  PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES,
  PORTAL_SCOPE_ACCOUNT_LIMIT,
} from './portal.constants';
import {
  toAdvertiserDto,
  toBillingProductDto,
  toBranchDto,
  toCampaignDto,
  toInvoiceDto,
  toPlanDto,
  toReceivableDto,
  toSubscriptionDto,
  type PortalAdvertiserDto,
  type PortalBillingProductDto,
  type PortalBranchDto,
  type PortalCampaignDto,
  type PortalPlanDto,
  type PortalSubscriptionDto,
} from './portal.mappers';
import { PortalScopeService, type PortalScope } from './portal.scope.service';
import type {
  AdvertisersQueryDto,
  BillingProductsQueryDto,
  BranchesQueryDto,
  CampaignsQueryDto,
  CreatePlanDto,
  CreatePortalBranchDto,
  PlansQueryDto,
  SetCampaignStatusDto,
  SetPortalBranchStatusDto,
  SubscribeDto,
  UpdatePlanDto,
  UpdatePortalBranchDto,
} from './portal.schemas';

/** Contexto del llamador ya resuelto: identidad + correlador + alcance por tenant. */
export interface PortalActor {
  user: AuthUser;
  requestId: string;
  scope: PortalScope;
}

interface BillingTotalsRow {
  invoice_count: string;
  invoiced_total: string;
  open_receivable_count: string;
  open_total: string;
}

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

@Injectable()
export class PortalService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
    private readonly scopeService: PortalScopeService,
    private readonly adsAuditService: AdsAuditService,
    private readonly businessActionLogs: BusinessActionLogsService,
    @InjectModel(MerchantPlanModel) private readonly planModel: typeof MerchantPlanModel,
    @InjectModel(BillingProductModel)
    private readonly billingProductModel: typeof BillingProductModel,
    @InjectModel(MerchantSubscriptionModel)
    private readonly subscriptionModel: typeof MerchantSubscriptionModel,
    @InjectModel(MerchantBranchModel) private readonly branchModel: typeof MerchantBranchModel,
    @InjectModel(MerchantUserModel) private readonly merchantUserModel: typeof MerchantUserModel,
    @InjectModel(B2BAccountModel) private readonly accountModel: typeof B2BAccountModel,
    @InjectModel(MerchantInvoiceModel) private readonly invoiceModel: typeof MerchantInvoiceModel,
    @InjectModel(MerchantReceivableModel)
    private readonly receivableModel: typeof MerchantReceivableModel,
    @InjectModel(AdvertiserAccountModel)
    private readonly advertiserModel: typeof AdvertiserAccountModel,
    @InjectModel(CampaignModel) private readonly campaignModel: typeof CampaignModel,
  ) {}

  /** Resuelve el alcance del llamador. Punto de entrada obligatorio de todos los endpoints. */
  resolveScope(user: AuthUser): Promise<PortalScope> {
    return this.scopeService.resolveScope(user);
  }

  // ------------------------------------------------------------------ Planes

  async listPlans(query: PlansQueryDto): Promise<PortalPlanDto[]> {
    const plans = await this.planModel.findAll({
      where: query.includeInactive === 'true' ? {} : { status: 'ACTIVE' },
      order: [
        ['sortOrder', 'ASC'],
        /* Por tarifa, no por cuota: `monthlyPrice` es cero en todos desde que se cobra por entrega. */
        ['cpmMicros', 'ASC'],
        ['code', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return plans.map((plan) => toPlanDto(plan));
  }

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

      this.logger.infoContext(PortalService.name, 'Plan merchant creado', {
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
  async updatePlan(planId: string, input: UpdatePlanDto, actor: PortalActor): Promise<PortalPlanDto> {
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

      this.logger.infoContext(PortalService.name, 'Tarifa de plan actualizada', {
        planId: plan.id,
        code: plan.code,
        userId: actor.user.sub,
        requestId: actor.requestId,
      });

      return toPlanDto(plan);
    });
  }

  // ------------------------------------------------- Productos facturables

  /**
   * Catálogo de lo que Atlas factura. Es de sólo lectura por diseño.
   *
   * Se siembra con la base de datos porque un producto sin cuenta de ingreso ni unidad de cobro
   * rompería la factura del comercio, y decidir esas dos cosas es del área contable, no de una
   * pantalla. Lo que sí se configura desde el ERP es el precio, que vive en cada tarifa.
   */
  async listBillingProducts(query: BillingProductsQueryDto): Promise<PortalBillingProductDto[]> {
    const products = await this.billingProductModel.findAll({
      where: query.includeInactive === 'true' ? {} : { status: 'ACTIVE' },
      order: [
        ['sortOrder', 'ASC'],
        ['code', 'ASC'],
      ],
    });
    return products.map((product) => toBillingProductDto(product));
  }

  // ----------------------------------------------------------- Suscripciones

  /**
   * Lo que este comercio le debe a Atlas: la comision de cada venta.
   *
   * El `accountId` sale del ALCANCE, no del parametro: un comercio no puede consultar la comision
   * de otro, y el staff interno si elige pero queda auditado como acceso delegado. Es el mismo
   * `resolveAccountId` que gobierna el resto del portal.
   */
  async listCommissions(scope: PortalScope, requestedAccountId?: string) {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const filas = await this.receivableModel.findAll({
      where: { accountId: merchantAccountId, sourceType: 'MDR' } as never,
      order: [['issued_at', 'DESC']],
      limit: 200,
    });

    const total = filas.reduce((suma, fila) => suma + Number(fila.amountOriginal), 0);
    /*
     * Lo ABIERTO es lo que de verdad debe. Una comision ya facturada y pagada dejo de ser deuda, y
     * presentarla como pendiente haria que el comercio provisionara dos veces el mismo dinero.
     */
    const abierto = filas.reduce((suma, fila) => suma + Number(fila.amountOpen), 0);

    return {
      summary: {
        chargedTotal: normalizeAmount(String(total)),
        owedToAtlas: normalizeAmount(String(abierto)),
        settled: normalizeAmount(String(total - abierto)),
        salesCharged: filas.length,
      },
      commissions: filas.map((fila) => ({
        id: fila.id,
        purchaseId: fila.sourceId,
        amountCharged: normalizeAmount(fila.amountOriginal),
        amountOpen: normalizeAmount(fila.amountOpen),
        currency: fila.currency,
        issuedAt: fila.issuedAt,
        dueDate: fila.dueDate,
        status: fila.status,
      })),
    };
  }

  async getSubscription(
    scope: PortalScope,
    requestedAccountId?: string,
  ): Promise<PortalSubscriptionDto | null> {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);
    const subscription = await this.findActiveSubscription(merchantAccountId);
    return toSubscriptionDto(subscription);
  }

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
        this.logger.infoContext(PortalService.name, 'Selección de plan sin cambios', {
          merchantAccountId,
          planId: input.planId,
          userId: actor.user.sub,
          requestId: actor.requestId,
        });
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

      this.logger.infoContext(PortalService.name, 'Plan merchant contratado', {
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

  // -------------------------------------------------------------- Sucursales

  async listBranches(scope: PortalScope, query: BranchesQueryDto): Promise<PortalBranchDto[]> {
    const accountId = this.scopeService.resolveAccountId(scope, query.accountId);
    const branches = await this.branchModel.findAll({
      where: { accountId },
      order: [['name', 'ASC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return branches.map((branch) => toBranchDto(branch));
  }

  /*
   * Alta, edición y baja de sucursales POR EL PROPIO COMERCIO.
   *
   * Antes esto sólo existía en el canal interno `/b2b/*`, así que el comercio veía la pantalla de
   * sucursales en modo lectura: podía mirar las suyas y nada más. La cuenta nunca se toma del
   * cuerpo de la petición: la resuelve `PortalScopeService` con las membresías reales del usuario.
   *
   * No hay borrado, y no es un olvido: de una sucursal cuelgan sus terminales, sus QR y las ventas
   * que originó, y esas cuotas siguen venciendo. Lo que se necesita es que deje de operar —estado
   * INACTIVE—, no que deje de haber existido.
   */
  async createBranch(input: CreatePortalBranchDto, actor: PortalActor): Promise<PortalBranchDto> {
    const accountId = this.scopeService.resolveAccountId(actor.scope, input.merchantAccountId);
    return this.sequelize.transaction(async (transaction) => {
      const branch = await this.branchModel.create(
        {
          accountId,
          name: input.name,
          city: input.city ?? null,
          address: input.address ?? null,
          // Nace operativa: el comercio está declarando un local en el que ya atiende. Vender a
          // crédito ahí es otra cosa y la concede Atlas (`canOriginateBnpl`, canal interno).
          status: 'ACTIVE',
          canOriginateBnpl: false,
          activatedAt: new Date(),
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_CREATE_BRANCH',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { name: input.name, city: input.city ?? null, delegated: actor.scope.isInternalOperator },
        outputSummary: { branchId: branch.id },
        transaction,
      });

      this.logger.infoContext(PortalService.name, 'Sucursal creada desde el portal del comercio', {
        branchId: branch.id,
        accountId,
      });
      return toBranchDto(branch);
    });
  }

  async updateBranch(
    branchId: string,
    input: UpdatePortalBranchDto,
    actor: PortalActor,
  ): Promise<PortalBranchDto> {
    return this.sequelize.transaction(async (transaction) => {
      const branch = await this.findOwnBranch(branchId, actor, transaction);
      const before = branch.get({ plain: true }) as Record<string, unknown>;
      await branch.update(input, { transaction });

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_UPDATE_BRANCH',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: branch.accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { changed: Object.keys(input), before: { name: before.name ?? null, city: before.city ?? null } },
        outputSummary: { branchId: branch.id },
        transaction,
      });
      return toBranchDto(branch);
    });
  }

  async setBranchStatus(
    branchId: string,
    input: SetPortalBranchStatusDto,
    actor: PortalActor,
  ): Promise<PortalBranchDto> {
    return this.sequelize.transaction(async (transaction) => {
      const branch = await this.findOwnBranch(branchId, actor, transaction);
      if (branch.status === input.status) return toBranchDto(branch);

      const before = branch.status;
      await branch.update(
        {
          status: input.status,
          // Una sucursal dada de baja no puede seguir originando crédito, diga lo que diga su marca.
          ...(input.status === 'INACTIVE' ? { canOriginateBnpl: false } : {}),
          ...(input.status === 'ACTIVE' && !branch.activatedAt ? { activatedAt: new Date() } : {}),
        },
        { transaction },
      );

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_STRUCTURE',
        actionCode: 'PORTAL_SET_BRANCH_STATUS',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'MERCHANT_BRANCH',
        aggregateId: branch.id,
        correlationId: branch.accountId,
        requestId: actor.requestId,
        affectedTables: ['merchant_branches'],
        affectedRecordCount: 1,
        status: 'SUCCESS',
        inputSummary: { from: before, to: input.status },
        outputSummary: { branchId: branch.id },
        transaction,
      });
      return toBranchDto(branch);
    });
  }

  /** Carga la sucursal comprobando que pertenece a una cuenta del alcance de quien pregunta. */
  private async findOwnBranch(
    branchId: string,
    actor: PortalActor,
    transaction: Transaction,
  ): Promise<MerchantBranchModel> {
    const branch = await this.branchModel.findByPk(branchId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Sucursal no encontrada.' });
    }
    this.scopeService.assertAccountAccess(actor.scope, branch.accountId);
    return branch;
  }

  // ------------------------------------------------------- Panel de consumo

  /**
   * Panel de consumo y facturación del comercio.
   *
   * Los totales se calculan en la base sobre el universo completo de documentos y con aritmética
   * `numeric`, no sumando en JavaScript la página devuelta: la versión anterior acumulaba en coma
   * flotante solo las primeras 100 filas y presentaba ese resultado como "monto acumulado", lo que
   * subdeclaraba el facturado y el saldo abierto de cualquier comercio con historial.
   */
  /**
   * Sobre qué comercios puede operar quien está mirando, contestado por el SERVIDOR.
   *
   * Existe porque el portal no puede seguir adivinándolo. El navegador decidía si era «comercio»
   * a partir de un valor que él mismo se guardó al entrar (`sessionKind`), mientras el backend lo
   * decide por los roles del token. Cuando los dos no coinciden —y con
   * `AUTH_DISABLED_FOR_LOCAL_TESTING=true` NUNCA coinciden, porque ahí toda petición llega como
   * ADMIN— la pantalla quedaba en un callejón sin salida: se creía comercio, así que no pintaba
   * el selector ni mandaba cuenta, y el backend le exigía la cuenta que la pantalla había
   * decidido no ofrecer. Cuatro pantallas del portal, el mismo muro.
   *
   * La lista NO es «todas las cuentas»: para un comercio son sus membresías y nada más, así que
   * este endpoint es seguro de llamar desde el portal —al contrario que `b2b/accounts`, que es
   * interno y un comercio ni siquiera puede invocar—.
   */
  async getScope(scope: PortalScope) {
    const where = scope.isInternalOperator ? {} : { id: { [Op.in]: scope.accountIds } };
    const accounts = await this.accountModel.findAll({
      where,
      attributes: ['id', 'tradeName', 'legalName'],
      order: [['tradeName', 'ASC']],
      limit: PORTAL_SCOPE_ACCOUNT_LIMIT,
    });

    return {
      isInternalOperator: scope.isInternalOperator,
      /*
       * Que haya que ELEGIR es un dato del servidor, no una deducción de la pantalla.
       *
       * Un comercio con una sola cuenta no elige —el backend la infiere—; con varias, sí. Y el
       * staff interno siempre elige. Mandarlo resuelto evita que cada pantalla repita esa regla
       * y se equivoque de forma distinta.
       */
      requiresAccountSelection: scope.isInternalOperator || scope.accountIds.length > 1,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.tradeName || account.legalName,
      })),
    };
  }

  async getBillingPanel(scope: PortalScope, requestedAccountId?: string) {
    const merchantAccountId = this.scopeService.resolveAccountId(scope, requestedAccountId);

    const [subscription, invoices, receivables, totals] = await Promise.all([
      this.findActiveSubscription(merchantAccountId),
      this.invoiceModel.findAll({
        where: { accountId: merchantAccountId },
        order: [
          ['invoiceDate', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: PORTAL_BILLING_DOCUMENT_LIMIT,
      }),
      this.receivableModel.findAll({
        where: { accountId: merchantAccountId },
        order: [
          ['issuedAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: PORTAL_BILLING_DOCUMENT_LIMIT,
      }),
      this.loadBillingTotals(merchantAccountId),
    ]);

    const subscriptionDto = toSubscriptionDto(subscription);

    return {
      merchantAccountId,
      subscription: subscriptionDto,
      invoices: invoices.map((invoice) => toInvoiceDto(invoice)),
      receivables: receivables.map((receivable) => toReceivableDto(receivable)),
      documentLimit: PORTAL_BILLING_DOCUMENT_LIMIT,
      summary: {
        invoiceCount: totals.invoiceCount,
        invoicedTotal: totals.invoicedTotal,
        openReceivableCount: totals.openReceivableCount,
        openTotal: totals.openTotal,
        monthlyPlanPrice: subscriptionDto?.plan?.monthlyPrice ?? '0.00',
        planName: subscriptionDto?.plan?.name ?? null,
        currency: subscriptionDto?.plan?.currency ?? null,
      },
    };
  }

  // ---------------------------------------------- Publicidad del comercio

  async listAdvertisers(
    scope: PortalScope,
    query: AdvertisersQueryDto,
  ): Promise<PortalAdvertiserDto[]> {
    const advertiserIds = await this.scopeService.resolveAccessibleAdvertiserIds(
      scope,
      query.merchantAccountId,
    );

    // `null` = staff interno sin cuenta indicada: sin filtro de propiedad, con tope de página.
    if (advertiserIds !== null && advertiserIds.length === 0) return [];

    const advertisers = await this.advertiserModel.findAll({
      ...(advertiserIds === null ? {} : { where: { id: { [Op.in]: advertiserIds } } }),
      order: [['tradeName', 'ASC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return advertisers.map((advertiser) => toAdvertiserDto(advertiser));
  }

  async listCampaigns(scope: PortalScope, query: CampaignsQueryDto): Promise<PortalCampaignDto[]> {
    await this.scopeService.assertAdvertiserAccess(scope, query.advertiserId);

    const campaigns = await this.campaignModel.findAll({
      where: { advertiserId: query.advertiserId },
      order: [['createdAt', 'DESC']],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return campaigns.map((campaign) =>
      toCampaignDto(campaign, this.isCampaignToggleable(campaign)),
    );
  }

  /**
   * Encendido/apagado de una campaña por el comercio.
   *
   * Es la única mutación del portal sobre un agregado facturable de publicidad, así que replica
   * las garantías de la consola administrativa y añade las propias del canal:
   *
   * 1. Propiedad del anunciante (`PortalScopeService`), antes de tocar nada.
   * 2. Anunciante habilitado: `status = ACTIVE` y `risk_status <> BLOCKED`.
   * 3. Solo campañas ya lanzadas (`ACTIVE`/`PAUSED`); el alta y la edición siguen siendo internas.
   * 4. Las invariantes compartidas de transición — en particular, jamás activar sin aprobación
   *    de moderación.
   * 5. Al reactivar: presupuesto no agotado y campaña dentro de su ventana de vigencia.
   * 6. Bloqueo de fila, `ad_audit_log` y bitácora de acciones de negocio en la misma transacción.
   */
  async setCampaignStatus(
    campaignId: string,
    input: SetCampaignStatusDto,
    actor: PortalActor,
  ): Promise<PortalCampaignDto> {
    return this.sequelize.transaction(async (transaction) => {
      const campaign = await this.campaignModel.findByPk(campaignId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!campaign) {
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaña no encontrada.',
        });
      }

      await this.scopeService.assertAdvertiserAccess(
        actor.scope,
        campaign.advertiserId,
        transaction,
      );

      const before = campaign.get({ plain: true }) as Record<string, unknown>;
      const advertiser = await this.advertiserModel.findByPk(campaign.advertiserId, {
        transaction,
      });
      this.assertAdvertiserCanDeliver(advertiser);
      this.assertCampaignIsToggleable(campaign);
      assertCampaignTransition(campaign.status, campaign.approvalStatus, input.status);
      if (input.status === 'ACTIVE') this.assertCampaignCanResume(campaign);

      if (campaign.status === input.status) {
        // Idempotente: el estado deseado ya es el actual, no se genera ruido de auditoría.
        return toCampaignDto(campaign, this.isCampaignToggleable(campaign));
      }

      await campaign.update({ status: input.status }, { transaction });

      const reason =
        input.reason ??
        `Cambio de estado ${campaign.status} desde el portal del comercio por el usuario ${actor.user.sub}.`;

      const audit = await this.adsAuditService.record({
        actor: { user: actor.user, requestId: actor.requestId },
        actorType: actor.scope.isInternalOperator ? 'INTERNAL_ATLAS_USER' : 'MERCHANT_PORTAL_USER',
        entityType: 'CAMPAIGN',
        entityId: campaign.id,
        action: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
        reason,
        severity: input.status === 'PAUSED' ? 'HIGH' : 'MEDIUM',
        before,
        after: campaign.get({ plain: true }) as Record<string, unknown>,
        transaction,
      });

      await this.businessActionLogs.record({
        moduleCode: PORTAL_MODULE_CODE,
        businessProcess: 'MERCHANT_CAMPAIGN_CONTROL',
        actionCode: 'PORTAL_UPDATE_CAMPAIGN_STATUS',
        actorUserId: actor.user.sub,
        actorRole: actor.user.role ?? null,
        aggregateType: 'CAMPAIGN',
        aggregateId: campaign.id,
        correlationId: campaign.advertiserId,
        requestId: actor.requestId,
        affectedTables: ['ad_campaigns', 'ad_audit_log'],
        affectedRecordCount: 2,
        status: 'SUCCESS',
        inputSummary: {
          from: before.status ?? null,
          to: input.status,
          delegated: actor.scope.isInternalOperator,
        },
        outputSummary: { campaignId: campaign.id, auditId: audit.auditId },
        transaction,
      });

      this.logger.infoContext(PortalService.name, 'Cambio de estado de campaña desde el portal', {
        campaignId: campaign.id,
        advertiserId: campaign.advertiserId,
        from: before.status ?? null,
        to: input.status,
        userId: actor.user.sub,
        requestId: actor.requestId,
        auditId: audit.auditId,
      });

      return toCampaignDto(campaign, this.isCampaignToggleable(campaign));
    });
  }

  // ----------------------------------------------------------------- Apoyo

  private findActiveSubscription(
    merchantAccountId: string,
    transaction?: Transaction,
  ): Promise<MerchantSubscriptionModel | null> {
    return this.subscriptionModel.findOne({
      where: { merchantAccountId, status: 'ACTIVE' },
      include: [{ model: MerchantPlanModel }],
      order: [['startedAt', 'DESC']],
      transaction,
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

  private async loadBillingTotals(merchantAccountId: string): Promise<{
    invoiceCount: number;
    invoicedTotal: string;
    openReceivableCount: number;
    openTotal: string;
  }> {
    const [row] = await this.sequelize.query<BillingTotalsRow>(
      `SELECT
         (SELECT count(*) FROM atlas_sales.merchant_invoices WHERE account_id = $1) AS invoice_count,
         (SELECT coalesce(sum(total_amount), 0) FROM atlas_sales.merchant_invoices WHERE account_id = $1) AS invoiced_total,
         (SELECT count(*) FROM atlas_sales.merchant_receivables WHERE account_id = $1 AND amount_open > 0) AS open_receivable_count,
         (SELECT coalesce(sum(amount_open), 0) FROM atlas_sales.merchant_receivables WHERE account_id = $1) AS open_total`,
      { bind: [merchantAccountId], type: QueryTypes.SELECT },
    );

    return {
      invoiceCount: Number(row?.invoice_count ?? 0),
      invoicedTotal: normalizeAmount(row?.invoiced_total ?? '0'),
      openReceivableCount: Number(row?.open_receivable_count ?? 0),
      openTotal: normalizeAmount(row?.open_total ?? '0'),
    };
  }

  private isCampaignToggleable(campaign: CampaignModel): boolean {
    return (PORTAL_TOGGLEABLE_CAMPAIGN_STATUSES as readonly string[]).includes(campaign.status);
  }

  private assertCampaignIsToggleable(campaign: CampaignModel): void {
    if (this.isCampaignToggleable(campaign)) return;
    throw new ConflictException({
      code: 'CAMPAIGN_NOT_TOGGLEABLE',
      message: 'Solo se pueden prender/apagar campañas ya lanzadas (activas o pausadas).',
    });
  }

  private assertAdvertiserCanDeliver(advertiser: AdvertiserAccountModel | null): void {
    if (!advertiser) {
      throw new NotFoundException({
        code: 'ADVERTISER_NOT_FOUND',
        message: 'El anunciante de la campaña no existe.',
      });
    }
    if (advertiser.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'ADVERTISER_NOT_ACTIVE',
        message: `El anunciante está en estado ${advertiser.status} y no puede operar campañas.`,
      });
    }
    if (advertiser.riskStatus === 'BLOCKED') {
      throw new ForbiddenException({
        code: 'ADVERTISER_RISK_BLOCKED',
        message: 'El anunciante está bloqueado por riesgo. Contacta a tu ejecutivo comercial.',
      });
    }
  }

  private assertCampaignCanResume(campaign: CampaignModel): void {
    const budgetTotal = BigInt(String(campaign.budgetTotalMicros ?? 0));
    const spendTotal = BigInt(String(campaign.spendTotalMicros ?? 0));
    if (budgetTotal > 0n && spendTotal >= budgetTotal) {
      throw new ConflictException({
        code: 'CAMPAIGN_BUDGET_EXHAUSTED',
        message: 'La campaña agotó su presupuesto total y no puede reactivarse.',
      });
    }

    if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'CAMPAIGN_SCHEDULE_EXPIRED',
        message: 'La campaña terminó su ventana de vigencia y no puede reactivarse.',
      });
    }
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
