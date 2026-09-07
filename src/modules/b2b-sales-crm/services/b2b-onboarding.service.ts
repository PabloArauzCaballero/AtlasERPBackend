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
  SetBranchStatusDto,
  UpdateBranchDto,
} from '../b2b-sales-crm.dtos';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { B2BSalesCrmUseCaseBase } from './b2b-sales-crm-use-case.base';
import { AtlasIdentityClient } from '../../auth-gateway/atlas-identity.client';

@Injectable()
export class B2BOnboardingService extends B2BSalesCrmUseCaseBase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly identityClient: AtlasIdentityClient,
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
          status: { [Op.in]: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
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
   * Lista los casos con el NOMBRE del comercio, no solo su uuid.
   *
   * Sin esta lectura la pantalla no tenia de donde sacar los casos y pedia teclear el uuid a mano:
   * un vendedor no se sabe un uuid de memoria, asi que el flujo era inoperable fuera de una demo
   * preparada. Devuelve `tradeName` para que el desplegable diga «CPA Centro...» y no un hexadecimal.
   */
  async listOnboardingCases(): Promise<Record<string, unknown>[]> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'listOnboardingCases',
    });
    const rows = await this.repository.onboardingCases.findAll({
      include: [this.repository.accounts, this.repository.checklistItems],
      /* El ATRIBUTO del modelo, no la columna: con `started_at` Sequelize genera una referencia
         que Postgres no resuelve dentro de la subconsulta que produce `limit` + `include`. */
      order: [['startedAt', 'DESC']],
      limit: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      tradeName: row.account?.tradeName ?? row.account?.legalName ?? null,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      pendingItems: (row.checklistItems ?? []).filter((item) => item.status === 'PENDING').length,
      checklistItems: (row.checklistItems ?? []).map((item) => ({
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        status: item.status,
      })),
    }));
  }

  async getOnboardingCase(id: string, transaction?: Transaction): Promise<Record<string, unknown>> {
    this.logger.infoContext(B2BOnboardingService.name, 'B2B CRM use case started', {
      useCase: 'getOnboardingCase',
    });
    const caseRecord = await this.repository.onboardingCases.findByPk(
      id,
      transaction
        ? { include: [this.repository.checklistItems], transaction }
        : { include: [this.repository.checklistItems] },
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
        pendingChecklistItems: (caseRecord.checklistItems ?? []).filter(
          (item) => item.status !== 'COMPLETED' && item.status !== 'WAIVED',
        ).length,
        hasActiveContract: Boolean(
          await this.repository.findActiveContractVersion(
            caseRecord.accountId,
            new Date().toISOString().slice(0, 10),
            transaction,
          ),
        ),
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

    if (request.status === 'provisioned' && request.merchantUserId) {
      await user.update({ userId: request.merchantUserId, status: 'ACTIVE' });
    } else if (request.status === 'rejected') {
      // No se borra la fila: el rechazo trae motivo y el ejecutivo tiene que poder leerlo, corregir
      // y volver a pedirlo. Borrarla dejaría el rechazo sin dónde consultarse.
      await user.update({ status: 'DISABLED' });
    }

    return {
      id: user.id,
      status: user.status,
      userId: user.userId,
      identityRequestId: user.identityRequestId,
      identityStatus: request.status,
      rejectionReason: request.rejectionReason,
    };
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

      const activeVersion = await this.repository.findActiveContractVersion(
        caseRecord.accountId,
        new Date().toISOString().slice(0, 10),
        transaction,
      );

      if (!activeVersion) {
        throw new ConflictException('No se puede activar comercio sin contrato activo.');
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
