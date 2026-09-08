import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { AccountLifecycleStatus, BranchStatus, ChecklistStatus } from '../b2b-sales-crm.enums';
import type {
  CompleteChecklistItemDto,
  CreateBranchDto,
  CreateMerchantUserDto,
  CreateOnboardingCaseDto,
  ListOnboardingCasesQueryDto,
  AssignCaseContractDto,
  RequestKybReviewDto,
  SetBranchStatusDto,
  UpdateBranchDto,
} from '../b2b-sales-crm.dtos';
import {
  ONBOARDING_OPEN_STATUSES,
  ONBOARDING_TERMINAL_STATUS,
  STATUSES_THAT_CAN_REQUEST_KYB,
  STATUS_FOR_KYB_OUTCOME,
  describeCredentials,
  type KybOutcome,
  statusesForScope,
  summarizeCredentials,
  summarizeOnboardingQueue,
  type OnboardingCaseSnapshot,
} from '../domain/onboarding-lifecycle';
import type { ContractVersionModel, MerchantOnboardingCaseModel } from '../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { AtlasIdentityClient } from '../../auth-gateway/atlas-identity.client';
import type { AtlasMerchantProvisioningRequest } from '../../auth-gateway/auth-gateway.types';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import { AtlasPartnerClient } from '../../partner-onboarding-gateway/atlas-partner.client';

/**
 * «Pendiente» con la regla de la activación: todo lo que no esté completado ni eximido. Antes la
 * lista contaba sólo `PENDING` y la activación también rechazaba `BLOCKED`, así que un caso podía
 * enseñar «0 pendientes» y aun así no activarse.
 */
function countPendingItems(items: readonly { status: string }[]): number {
  return items.filter((item) => item.status !== ChecklistStatus.COMPLETED && item.status !== ChecklistStatus.WAIVED).length;
}

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

/** Activa y vigente hoy, y su contrato activo: la misma regla que `findActiveContractVersion`. */
function isContractVersionActivatable(
  version: { status: string; validFrom: string; validTo: string | null; contract?: { status: string } | undefined },
  today: string,
): boolean {
  return (
    version.status === 'ACTIVE' &&
    version.contract?.status === 'ACTIVE' &&
    version.validFrom <= today &&
    (version.validTo === null || version.validTo >= today)
  );
}

/**
 * La posición del caso en la cadena, tal como la lee la fila: el contrato pactado y lo que dijo
 * el Motor. Se publica igual en la lista y en el detalle para que la pantalla no tenga dos formas.
 */
function describeCaseChain(row: MerchantOnboardingCaseModel): Record<string, unknown> {
  return {
    contractVersionId: row.contractVersionId,
    contractNumber: row.contractVersion?.contract?.contractNumber ?? null,
    contractVersionNumber: row.contractVersion?.versionNumber ?? null,
    contractVersionStatus: row.contractVersion?.status ?? null,
    decisionOutcome: row.decisionOutcome,
    decisionReason: row.decisionReason,
    decisionExecutionId: row.decisionExecutionId,
    manualReviewCaseCode: row.manualReviewCaseCode,
    decidedAt: row.decidedAt,
    identityAcknowledgedAt: row.identityAcknowledgedAt,
    partnerProfileId: row.account?.partnerProfileId ?? null,
  };
}

@Injectable()
export class B2BOnboardingService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly identityClient: AtlasIdentityClient,
    private readonly businessActionLogsService: BusinessActionLogsService,
    private readonly partnerClient: AtlasPartnerClient,
  ) {
    super(repository, logger);
  }

  async createOnboardingCase(input: CreateOnboardingCaseDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createOnboardingCase',
    });
    return this.repository.transaction(async (transaction) => {
      const account = await this.repository.accounts.findByPk(input.accountId, { transaction });

      if (!account) {
        throw new NotFoundException('Cuenta B2B no encontrada.');
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

      return this.getOnboardingCase(caseRecord.id, transaction);
    });
  }

  /**
   * La cola de onboarding: sólo lo que falta por hacer, salvo que se pida el historial.
   *
   * Sin esta lectura la pantalla no tenía de dónde sacar los casos y pedía teclear el uuid a mano.
   * Y con la lectura sin filtro pasaba lo contrario: los comercios ya activados salían en la misma
   * tabla que los pendientes, así que la cola no se podía leer. El `scope` decide qué es trabajo
   * (ver `domain/onboarding-lifecycle.ts`), y se aplica en la consulta, no en el cliente.
   * Devuelve `tradeName` para que la fila diga «CPA Centro…» y no un hexadecimal.
   */
  async listOnboardingCases(query: ListOnboardingCasesQueryDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'listOnboardingCases',
    });
    const statuses = query.status ? [query.status] : statusesForScope(query.scope);
    const where: Record<string | symbol, unknown> = { status: { [Op.in]: statuses } };
    if (query.accountId) where.accountId = query.accountId;

    const accountWhere = query.search
      ? {
          [Op.or]: [
            { tradeName: { [Op.iLike]: `%${query.search}%` } },
            { legalName: { [Op.iLike]: `%${query.search}%` } },
          ],
        }
      : undefined;

    const offset = (query.page - 1) * query.limit;
    const result = await this.repository.onboardingCases.findAndCountAll({
      where,
      include: [
        { model: this.repository.accounts, required: true, ...(accountWhere ? { where: accountWhere } : {}) },
        this.repository.checklistItems,
        { model: this.repository.contractVersions, required: false, include: [this.repository.contracts] },
      ],
      /* El ATRIBUTO del modelo, no la columna: con `started_at` Sequelize genera una referencia
         que Postgres no resuelve dentro de la subconsulta que produce `limit` + `include`. */
      order: [['startedAt', 'DESC']],
      limit: query.limit,
      offset,
      distinct: true,
    });

    const credentialsByAccount = await this.credentialsByAccount(result.rows.map((row) => row.accountId));
    const items = result.rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      tradeName: row.account?.tradeName ?? row.account?.legalName ?? null,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      pendingItems: countPendingItems(row.checklistItems ?? []),
      ...describeCaseChain(row),
      ...this.describeCredentialsOf(credentialsByAccount.get(row.accountId) ?? []),
      checklistItems: (row.checklistItems ?? []).map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        status: item.status,
      })),
    }));

    return {
      items,
      page: query.page,
      limit: query.limit,
      total: result.count,
      totalPages: Math.ceil(result.count / query.limit),
    };
  }

  /**
   * Las cifras del mini-tablero, contadas sobre TODOS los casos y con la misma regla que aplica la
   * activación. Un tablero que afirma «3 listos» con una regla distinta a la del botón convence a
   * quien lo lee de algo que el backend va a rechazar.
   */
  async summarizeOnboardingQueue(): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'summarizeOnboardingQueue',
    });
    const rows = await this.repository.onboardingCases.findAll({
      include: [this.repository.checklistItems],
    });

    // El contrato sólo importa para los que podrían activarse: consultarlo para los ya activados
    // sería trabajo para no usarlo. Y se resuelve con la MISMA función que la activación —el
    // pactado en el caso, o el activo de la cuenta— para que «listo» aquí sea «listo» allí.
    const snapshots: OnboardingCaseSnapshot[] = [];
    for (const row of rows) {
      const pendingItems = countPendingItems(row.checklistItems ?? []);
      const candidate = row.status !== ONBOARDING_TERMINAL_STATUS && pendingItems === 0;
      snapshots.push({
        status: row.status,
        pendingItems,
        hasActiveContract: candidate
          ? Boolean(await this.resolveContractVersionForActivation(row))
          : false,
        motorApproved: row.decisionOutcome === 'APROBADO',
      });
    }

    return { ...summarizeOnboardingQueue(snapshots), total: rows.length };
  }

  async getOnboardingCase(id: string, transaction?: Transaction): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'getOnboardingCase',
    });
    const include = [
      this.repository.checklistItems,
      this.repository.accounts,
      { model: this.repository.contractVersions, required: false, include: [this.repository.contracts] },
    ];
    const caseRecord = await this.repository.onboardingCases.findByPk(
      id,
      transaction ? { include, transaction } : { include },
    );

    if (!caseRecord) {
      throw new NotFoundException('Caso de onboarding no encontrado.');
    }

    return {
      id: caseRecord.id,
      accountId: caseRecord.accountId,
      ownerUserId: caseRecord.ownerUserId,
      status: caseRecord.status,
      startedAt: caseRecord.startedAt,
      completedAt: caseRecord.completedAt,
      ...describeCaseChain(caseRecord),
      ...this.describeCredentialsOf((await this.credentialsByAccount([caseRecord.accountId], transaction)).get(caseRecord.accountId) ?? []),
      checklistItems: caseRecord.checklistItems?.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        status: item.status,
        completedByUserId: item.completedByUserId,
      })),
      /*
       * Las DOS condiciones que `activateOnboardingCase` comprueba de verdad antes de habilitar al
       * comercio. Se devuelven aqui para que la pantalla pueda decir en que estado esta cada una en
       * vez de dibujar cuatro comprobaciones siempre en verde: un panel que afirma «READY» sin haber
       * mirado nada es peor que no tener panel, porque convence a quien lo lee de que ya comprobo.
       */
      readiness: {
        pendingChecklistItems: countPendingItems(caseRecord.checklistItems ?? []),
        hasActiveContract: Boolean(await this.resolveContractVersionForActivation(caseRecord, transaction)),
        motorApproved: caseRecord.decisionOutcome === 'APROBADO',
      },
    };
  }

  /** Edita una sucursal existente. No cambia de comercio: eso movería ventas de cuenta. */
  async updateBranch(branchId: string, input: UpdateBranchDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'updateBranch',
    });
    const branch = await this.repository.branches.findByPk(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');

    await branch.update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.canOriginateBnpl !== undefined ? { canOriginateBnpl: input.canOriginateBnpl } : {}),
    });
    return this.describeBranch(branch);
  }

  /**
   * Da de alta o de baja una sucursal. NO la borra.
   *
   * Borrarla se llevaria por delante el historial de las ventas que origino. Una sucursal cerrada
   * tiene que seguir siendo consultable: sus cuotas siguen venciendo y alguien tendra que explicar
   * de donde salieron. Al desactivarla se le quita ademas la capacidad de originar BNPL, que es lo
   * que de verdad significa «cerrada» para el negocio.
   */
  async setBranchStatus(
    branchId: string,
    input: SetBranchStatusDto,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'setBranchStatus',
    });
    const branch = await this.repository.branches.findByPk(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');

    const activa = input.status === 'ACTIVE';
    await branch.update({
      status: input.status,
      canOriginateBnpl: activa ? branch.canOriginateBnpl : false,
      ...(activa && !branch.activatedAt ? { activatedAt: new Date() } : {}),
    });
    return this.describeBranch(branch);
  }

  private describeBranch(branch: {
    id: string;
    accountId: string;
    name: string;
    city: string | null;
    address: string | null;
    status: string;
    canOriginateBnpl: boolean;
  }): Record<string, unknown> {
    return {
      id: branch.id,
      accountId: branch.accountId,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      canOriginateBnpl: branch.canOriginateBnpl,
    };
  }

  /**
   * Las sucursales de un comercio.
   *
   * Sin esto, `POST /b2b/onboarding/branches` era escritura sin lectura: la sucursal quedaba en la
   * tabla y ninguna respuesta del ERP volvía a nombrarla. `canOriginateBnpl` es lo que decide si en
   * esa sucursal se puede vender a plazos, así que es lo primero que hay que poder mirar.
   */
  async listBranches(filtro: {
    accountId?: string | undefined;
    status?: string | undefined;
  }): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = {};
    if (filtro.accountId) where.accountId = filtro.accountId;
    if (filtro.status) where.status = filtro.status;

    const branches = await this.repository.branches.findAll({
      where,
      order: [
        ['account_id', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    return branches.map((branch) => this.describeBranch(branch));
  }

  async createBranch(input: CreateBranchDto): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createBranch',
    });
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    const branch = await this.repository.branches.create({
      accountId: input.accountId,
      name: input.name,
      city: input.city ?? null,
      address: input.address ?? null,
      status: BranchStatus.PENDING,
      canOriginateBnpl: false,
    });

    return {
      id: branch.id,
      accountId: branch.accountId,
      name: branch.name,
      status: branch.status,
      canOriginateBnpl: branch.canOriginateBnpl,
    };
  }

  /**
   * Registrar a una persona como usuario de un comercio, y PEDIR su acceso.
   *
   * ## Por qué son dos pasos y no uno
   *
   * Esta fila responde «de qué comercio es y qué puede tocar». Quién es y cómo inicia sesión vive
   * en AtlasBackend (`iam.merchant_users`), y esa parte NO la escribe el ERP: la concede el
   * personal interno de Atlas, que es quien responde de a quién se le entrega una credencial.
   *
   * Antes las dos altas se hacían por separado y sin relación —esta aquí, la identidad tecleada a
   * mano en el portal interno—, y nada garantizaba que el correo coincidiera. Cuando no coincidía,
   * `user_id` se quedaba nulo para siempre: la persona podía iniciar sesión y el portal del
   * comercio le respondía 403, con la causa a dos sistemas de distancia. Ahora el ERP encola la
   * petición y guarda su identificador, así que siempre se puede responder en qué quedó.
   *
   * ## Nace INVITED, no ACTIVE
   *
   * Porque todavía no puede entrar: falta que Atlas conceda la identidad. Marcarla ACTIVE de salida
   * era prometer un acceso que no existía.
   *
   * ## Si la cola no responde, el alta NO se guarda
   *
   * La fila del CRM y la petición van juntas o no van. Guardar sólo la fila devolvería exactamente
   * el estado que este cambio elimina: un usuario de comercio del que nadie pidió el acceso, que
   * nadie va a conceder y que en la pantalla se ve idéntico a uno en trámite.
   */
  async createMerchantUser(
    input: CreateMerchantUserDto,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'createMerchantUser',
    });
    const account = await this.repository.accounts.findByPk(input.accountId);

    if (!account) {
      throw new NotFoundException('Cuenta B2B no encontrada.');
    }

    let branchName: string | null = null;
    if (input.branchId) {
      const branch = await this.repository.branches.findOne({
        where: { id: input.branchId, accountId: input.accountId },
      });

      if (!branch) {
        throw new NotFoundException('Sucursal no encontrada para la cuenta indicada.');
      }
      branchName = branch.name;
    }

    const existingUser = await this.repository.merchantUsers.findOne({
      where: { accountId: input.accountId, email: input.email },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario comercio con ese email en la cuenta.');
    }

    return this.repository.transaction(async (transaction) => {
      const user = await this.repository.merchantUsers.create(
        {
          accountId: input.accountId,
          branchId: input.branchId ?? null,
          email: input.email,
          fullName: input.fullName,
          roleCode: input.roleCode,
          status: 'INVITED',
        },
        { transaction },
      );

      // Dentro de la transacción a propósito: si Atlas rechaza la petición —correo ya tomado, otra
      // pendiente para la misma persona— la fila del CRM se deshace y el error que ve el ejecutivo
      // comercial es el de Atlas, que es el que explica qué corregir.
      const request = await this.identityClient.enqueueMerchantUserProvisioning(accessToken, {
        externalReference: user.id,
        accountReference: user.accountId,
        accountName: account.legalName ?? account.tradeName ?? undefined,
        email: user.email,
        fullName: user.fullName,
        roleCode: user.roleCode,
        ...(branchName ? { branchName } : {}),
      });

      await user.update({ identityRequestId: request.id }, { transaction });

      // El caso abierto de ese comercio pasa a «esperando credenciales»: es el tramo del portal.
      await this.repository.onboardingCases.update(
        { status: 'ALTA_PENDIENTE' },
        { where: { accountId: input.accountId, status: { [Op.in]: ['OPEN', 'IN_PROGRESS', 'VERIFICADO', 'LISTO'] } }, transaction },
      );

      return {
        id: user.id,
        accountId: user.accountId,
        branchId: user.branchId,
        email: user.email,
        fullName: user.fullName,
        roleCode: user.roleCode,
        status: user.status,
        identityRequestId: request.id,
        identityStatus: request.status,
      };
    });
  }

  /**
   * Reconciliar el acceso: leer en qué quedó la petición y, si ya se concedió, enlazar la identidad.
   *
   * Es lo que cierra el circuito. AtlasBackend no llama de vuelta al ERP —no hay ninguna entrada
   * pensada para eso y abrirla por esto sólo añadiría una superficie más que proteger—, así que el
   * ERP pregunta. Escribir `user_id` es lo que hace que el alcance del portal del comercio deje de
   * depender del enlace de respaldo por correo.
   *
   * Es idempotente: llamarla dos veces sobre una ya enlazada no cambia nada.
   */
  async syncMerchantUserIdentity(
    merchantUserId: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'syncMerchantUserIdentity',
    });
    const user = await this.repository.merchantUsers.findByPk(merchantUserId);

    if (!user) {
      throw new NotFoundException('Usuario de comercio no encontrado.');
    }

    if (!user.identityRequestId) {
      throw new ConflictException(
        'Este usuario no tiene una petición de acceso encolada: se registró antes de que el alta pasara por la cola.',
      );
    }

    const request = await this.identityClient.getMerchantUserProvisioning(
      accessToken,
      user.identityRequestId,
    );
    await this.applyProvisioningResult(user, request);

    return {
      id: user.id,
      status: user.status,
      userId: user.userId,
      identityRequestId: user.identityRequestId,
      identityStatus: request.status,
      rejectionReason: request.rejectionReason,
    };
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
      include: [{ model: this.repository.contracts, required: true, where: { accountId: caseRecord.accountId } }],
      order: [['validFrom', 'DESC'], ['versionNumber', 'DESC']],
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
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'assignCaseContract',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (caseRecord.status === ONBOARDING_TERMINAL_STATUS) {
      throw new ConflictException('El comercio ya está activado: el contrato del alta no se cambia sobre un expediente cerrado.');
    }

    const version = await this.repository.contractVersions.findOne({
      where: { id: input.contractVersionId },
      include: [{ model: this.repository.contracts, required: true, where: { accountId: caseRecord.accountId } }],
    });
    if (!version) {
      throw new NotFoundException('Esa versión de contrato no existe o no es de este comercio.');
    }

    await caseRecord.update({ contractVersionId: version.id });
    return this.getOnboardingCase(onboardingCaseId);
  }

  /** La versión de contrato del caso, exigida: sin ella no hay de dónde colgar una comisión. */
  async requireCaseContractVersionId(onboardingCaseId: string): Promise<string> {
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (!caseRecord.contractVersionId) {
      throw new ConflictException('Este caso no tiene contrato pactado: asigna el contrato antes de la comisión.');
    }
    return caseRecord.contractVersionId;
  }

  /**
   * Con qué contrato se activa: el pactado en el caso si lo hay —y sólo si está activo y vigente—,
   * o, si el caso no pactó ninguno, la versión activa de la cuenta (lo que siempre se hizo).
   * Un contrato pactado pero no vigente NO cae al de la cuenta: sería activar con condiciones
   * distintas de las que alguien eligió a propósito.
   */
  private async resolveContractVersionForActivation(
    caseRecord: { accountId: string; contractVersionId: string | null },
    transaction?: Transaction,
  ): Promise<ContractVersionModel | null> {
    const today = new Date().toISOString().slice(0, 10);
    if (!caseRecord.contractVersionId) {
      return this.repository.findActiveContractVersion(caseRecord.accountId, today, transaction);
    }
    const version = await this.repository.contractVersions.findOne({
      where: { id: caseRecord.contractVersionId },
      include: [{ model: this.repository.contracts, required: true, where: { accountId: caseRecord.accountId } }],
      ...(transaction ? { transaction } : {}),
    });
    return version && isContractVersionActivatable(version, today) ? version : null;
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
  async linkPartnerProfile(onboardingCaseId: string, accessToken: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'linkPartnerProfile',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, { include: [this.repository.accounts] });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    const account = caseRecord.account;
    if (account.partnerProfileId) {
      return { id: caseRecord.id, partnerProfileId: account.partnerProfileId, linked: true, alreadyLinked: true };
    }

    const encontrado = await this.findPartnerProfile(account.id, account.taxId, accessToken);
    if (!encontrado) {
      return { id: caseRecord.id, partnerProfileId: null, linked: false, reason: 'SIN_EXPEDIENTE_EN_ATLAS' };
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
    return { id: caseRecord.id, partnerProfileId: encontrado.partnerId, linked: true, onboardingStatus: encontrado.onboardingStatus };
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
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'requestKybReview',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, { include: [this.repository.accounts] });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    if (!STATUSES_THAT_CAN_REQUEST_KYB.includes(caseRecord.status as never)) {
      throw new ConflictException(`El caso está en ${caseRecord.status}: la verificación ya se pidió o ya no aplica.`);
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

    await caseRecord.update({ status: 'EN_VERIFICACION' });
    const respuesta = await this.partnerClient.forward<{
      partnerId: string;
      onboardingStatus: string;
      decision: KybDecision;
    }>({
      method: 'POST',
      path: `operations/partners/${encodeURIComponent(partnerId)}/kyb-review`,
      accessToken,
      body: input.reason ? { reason: input.reason } : {},
    });

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
    return this.getOnboardingCase(onboardingCaseId);
  }

  /**
   * Traer el desenlace vigente del expediente: lo que resolvió el caso de revisión manual del Motor
   * (lo aplica un job de AtlasBackend) o una decisión que el autoservicio disparó por su cuenta.
   */
  async syncKybDecision(onboardingCaseId: string, accessToken: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'syncKybDecision',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId, { include: [this.repository.accounts] });
    if (!caseRecord?.account) throw new NotFoundException('Caso de onboarding no encontrado.');
    const partnerId = caseRecord.account.partnerProfileId;
    if (!partnerId) {
      return { id: caseRecord.id, status: caseRecord.status, decisionOutcome: caseRecord.decisionOutcome, changed: false, reason: 'SIN_EXPEDIENTE_EN_ATLAS' };
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
    return { id: caseRecord.id, status: caseRecord.status, decisionOutcome: caseRecord.decisionOutcome, changed };
  }

  /** Aplica lo que publicó el Motor. Devuelve si el caso cambió. No reabre un caso ya activado. */
  private async applyKybDecision(
    caseRecord: MerchantOnboardingCaseModel,
    decision: KybDecision,
  ): Promise<boolean> {
    if (caseRecord.status === ONBOARDING_TERMINAL_STATUS) return false;
    const mismo =
      caseRecord.decisionExecutionId === decision.executionId &&
      caseRecord.decisionOutcome === decision.outcome &&
      caseRecord.manualReviewCaseCode === (decision.manualReviewCaseCode ?? null);
    if (mismo) return false;

    const siguiente = STATUS_FOR_KYB_OUTCOME[decision.outcome];
    // Un APROBADO tardío (revisión manual resuelta) no retrocede un caso que ya fue más lejos.
    const conservar = siguiente === 'VERIFICADO' && ['ALTA_PENDIENTE', 'LISTO'].includes(caseRecord.status);
    await caseRecord.update({
      decisionOutcome: decision.outcome,
      decisionReason: decision.reason ?? null,
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
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'reconcileCaseIdentity',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    if (!caseRecord) throw new NotFoundException('Caso de onboarding no encontrado.');

    const users = await this.repository.merchantUsers.findAll({
      where: { accountId: caseRecord.accountId, identityRequestId: { [Op.ne]: null } },
    });
    const pendientes = users.filter((user) => user.status === 'INVITED' && !user.userId);

    const resueltos: Array<{ id: string; email: string; status: string; identityStatus: string; rejectionReason: string | null }> = [];
    for (const user of pendientes) {
      const request = await this.identityClient.getMerchantUserProvisioning(accessToken, String(user.identityRequestId));
      const cambio = await this.applyProvisioningResult(user, request);
      if (cambio) {
        resueltos.push({ id: user.id, email: user.email, status: user.status, identityStatus: request.status, rejectionReason: request.rejectionReason ?? null });
      }
    }

    const summary = summarizeCredentials(users);
    const todasResueltas = summary.pedidas > 0 && summary.pendientes === 0 && summary.concedidas > 0;
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
      ...this.describeCredentialsOf(users),
      resueltos,
    };
  }

  /**
   * Aplica lo que dijo Atlas sobre una petición. Devuelve si la fila cambió.
   *
   * El rechazo NO borra la fila: trae motivo y el ejecutivo tiene que poder leerlo, corregir y
   * volver a pedirlo. Borrarla dejaría el rechazo sin dónde consultarse.
   */
  private async applyProvisioningResult(
    user: { status: string; userId: string | null; update: (values: Record<string, unknown>) => Promise<unknown> },
    request: AtlasMerchantProvisioningRequest,
  ): Promise<boolean> {
    if (request.status === 'provisioned' && request.merchantUserId && !user.userId) {
      await user.update({ userId: request.merchantUserId, status: 'ACTIVE' });
      return true;
    }
    if (request.status === 'rejected' && user.status !== 'DISABLED') {
      await user.update({ status: 'DISABLED' });
      return true;
    }
    return false;
  }

  /** Los usuarios con petición de identidad, agrupados por cuenta, para la lista y el detalle. */
  private async credentialsByAccount(
    accountIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, Array<{ status: string; identityRequestId: string | null; userId: string | null }>>> {
    const map = new Map<string, Array<{ status: string; identityRequestId: string | null; userId: string | null }>>();
    if (accountIds.length === 0) return map;
    const users = await this.repository.merchantUsers.findAll({
      where: { accountId: { [Op.in]: accountIds } },
      attributes: ['accountId', 'status', 'identityRequestId', 'userId'],
      ...(transaction ? { transaction } : {}),
    });
    for (const user of users) {
      const list = map.get(user.accountId) ?? [];
      list.push({ status: user.status, identityRequestId: user.identityRequestId, userId: user.userId });
      map.set(user.accountId, list);
    }
    return map;
  }

  private describeCredentialsOf(
    users: ReadonlyArray<{ status: string; identityRequestId: string | null; userId: string | null }>,
  ): Record<string, unknown> {
    const credentials = summarizeCredentials(users);
    return { credentials, credentialsSummary: describeCredentials(credentials) };
  }

  async completeChecklistItem(
    onboardingCaseId: string,
    input: CompleteChecklistItemDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'completeChecklistItem',
    });
    const item = await this.repository.checklistItems.findOne({
      where: { id: input.checklistItemId, onboardingCaseId },
    });

    if (!item) {
      throw new NotFoundException('Ítem de checklist no encontrado.');
    }

    await item.update({
      status: input.status,
      completedByUserId: await this.resolveInternalUserId(user),
    });
    return this.getOnboardingCase(onboardingCaseId);
  }

  /**
   * Traduce el principal del token al usuario interno DE ESTE backend.
   *
   * Atlas parte la identidad a proposito: quien es la persona y como inicia sesion vive en
   * AtlasBackend, que emite identificadores opacos (bigints: `"1"`, `"27"`); a que puede tocar
   * aqui responde `atlas_sales.internal_users`, cuya clave es un `uuid`. `completed_by_user_id`
   * apunta a esa tabla.
   *
   * Antes se guardaba `user.sub` directamente y Postgres rechazaba `"1"` como uuid: completar un
   * requisito moria en un 500 «Ocurrio un error al consultar o modificar la base de datos.» y, sin
   * poder completarlo, la activacion quedaba bloqueada para siempre por su propio control. Es el
   * mismo error que ya se corrigio en la revision manual del motor: dos identidades distintas para
   * la misma persona.
   *
   * Se resuelve por correo, que es lo unico que ambas bases comparten. Si la persona autentica
   * contra AtlasBackend y aun no tiene reflejo aqui, se crea: es exactamente lo que ya hace el
   * canal del comercio con `merchant_users.user_id`, y evita que un analista recien dado de alta
   * arriba se quede sin poder trabajar abajo.
   */
  private async resolveInternalUserId(user: AuthUser): Promise<string | null> {
    const email = user.email?.trim().toLowerCase();
    if (!email) return null;

    const existing = await this.repository.internalUsers.findOne({ where: { email } });
    if (existing) return existing.id;

    const created = await this.repository.internalUsers.create({
      email,
      fullName: email,
      roleCode: user.roleCode ?? user.role ?? 'ADMIN',
      isActive: true,
    });
    return created.id;
  }

  async activateOnboardingCase(onboardingCaseId: string): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'activateOnboardingCase',
    });
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
        throw new ConflictException('El comercio ya está activado: este caso es su expediente cerrado.');
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

      const activeVersion = await this.resolveContractVersionForActivation(caseRecord, transaction);

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
      await this.repository.branches.update(
        { status: BranchStatus.ACTIVE, canOriginateBnpl: true, activatedAt: new Date() },
        { where: { accountId: caseRecord.accountId, status: BranchStatus.PENDING }, transaction },
      );

      return this.getOnboardingCase(caseRecord.id, transaction);
    });
  }
}
