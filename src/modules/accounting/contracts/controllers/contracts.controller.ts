import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateContractHeaderDto,
  CreateContractTermDto,
  UpdateContractHeaderDto,
  createContractHeaderSchema,
  createContractTermSchema,
  updateContractHeaderSchema,
} from '../../shared/schemas/accounting.schemas';
import { ContractsService } from '../services/contracts.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/contracts')
export class ContractsController {
  constructor(
    private readonly service: ContractsService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContractHeaderSchema)) body: UpdateContractHeaderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createContractHeaderSchema)) body: CreateContractHeaderDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createContract recibido.', {
      layer: 'controller',
      module: 'contracts',
      action: 'create',
      contractType: body.contractType,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.service.create(body, user);
  }

  @Post('terms')
  addTerm(
    @Body(new ZodValidationPipe(createContractTermSchema)) body: CreateContractTermDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint addContractTerm recibido.', {
      layer: 'controller',
      module: 'contracts',
      action: 'addTerm',
      contractId: body.contractId,
      termCode: body.termCode,
      userId: user.sub,
    });
    return this.service.addTerm(body, user);
  }
}
