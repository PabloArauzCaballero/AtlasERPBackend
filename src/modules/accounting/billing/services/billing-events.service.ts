import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { BillingEventModel, ContractHeaderModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { CreateBillingEventDto } from '../../shared/schemas/accounting.schemas';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/** Registro de eventos facturables de un contrato. */
@Injectable()
export class BillingEventsService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(BillingEventModel) private readonly billingEventModel: typeof BillingEventModel,
    @InjectModel(ContractHeaderModel)
    private readonly contractHeaderModel: typeof ContractHeaderModel,
  ) {}

  createBillingEvent(input: CreateBillingEventDto, user: AuthUser) {
    this.logger.info('Registrando evento facturable.', {
      layer: 'service',
      module: 'billing',
      action: 'createBillingEvent',
      contractId: input.contractId,
      eventType: input.eventType,
      externalRef: input.externalRef,
      userId: user.sub,
    });
    return this.sequelize.transaction(async (transaction) => {
      const contract = await this.contractHeaderModel.findByPk(input.contractId, { transaction });
      if (!contract) {
        throw new NotFoundException({
          code: 'CONTRACT_NOT_FOUND',
          message: 'El contrato asociado al evento facturable no existe.',
        });
      }
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, contract.legalEntityId);
      const event = await this.billingEventModel.create(
        { ...input, status: 'RECORDED' },
        { transaction },
      );
      this.logger.info('Evento facturable registrado.', {
        layer: 'service',
        module: 'billing',
        action: 'createBillingEvent',
        billingEventId: event.id,
        contractId: input.contractId,
      });
      return event;
    });
  }
}
