import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Op } from 'sequelize';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { CreateMerchantUserDto } from '../../b2b-sales-crm.dtos';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { AtlasIdentityClient } from '../../../auth-gateway/atlas-identity.client';
import { explainMissingAtlasPermission } from './atlas-permission-hint';
import { applyProvisioningResult } from './merchant-user-provisioning';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** El acceso de los usuarios de un comercio: pedirlo a Atlas y reconciliar lo que Atlas concedió. */
@Injectable()
export class MerchantUserAccessService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly identityClient: AtlasIdentityClient,
  ) {
    super(repository, logger);
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
    this.announce('createMerchantUser');
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
      const request = await this.identityClient
        .enqueueMerchantUserProvisioning(accessToken, {
          externalReference: user.id,
          accountReference: user.accountId,
          accountName: account.legalName ?? account.tradeName ?? undefined,
          email: user.email,
          fullName: user.fullName,
          roleCode: user.roleCode,
          ...(branchName ? { branchName } : {}),
        })
        .catch((error: unknown) => {
          throw explainMissingAtlasPermission(error, 'merchant.users.request');
        });

      await user.update({ identityRequestId: request.id }, { transaction });

      // El caso abierto de ese comercio pasa a «esperando credenciales»: es el tramo del portal.
      await this.repository.onboardingCases.update(
        { status: 'ALTA_PENDIENTE' },
        {
          where: {
            accountId: input.accountId,
            status: { [Op.in]: ['OPEN', 'IN_PROGRESS', 'VERIFICADO', 'LISTO'] },
          },
          transaction,
        },
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
    this.announce('syncMerchantUserIdentity');
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
    await applyProvisioningResult(user, request);

    return {
      id: user.id,
      status: user.status,
      userId: user.userId,
      identityRequestId: user.identityRequestId,
      identityStatus: request.status,
      rejectionReason: request.rejectionReason,
    };
  }
}
