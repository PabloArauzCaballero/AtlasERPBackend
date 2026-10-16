import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateBranchDto,
  CreateLedgerDto,
  CreateLegalEntityDto,
  createBranchSchema,
  createLedgerSchema,
  createLegalEntitySchema,
} from '../../shared/schemas/accounting.schemas';
import { LegalStructureService } from '../services/legal-structure.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/financial-structure')
export class FinancialStructureLegalController {
  constructor(
    private readonly legal: LegalStructureService,
    private readonly logger: PinoLoggerService,
  ) {}

  // ---- Listados maestros (para poblar selects en el frontend) ----
  @Get('legal-entities')
  listLegalEntities(@CurrentUser() user: AuthUser) {
    return this.legal.listLegalEntities(user);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: AuthUser) {
    return this.legal.listBranches(user);
  }

  @Get('ledgers')
  listLedgers(@CurrentUser() user: AuthUser) {
    return this.legal.listLedgers(user);
  }

  @Post('legal-entities')
  @Roles('admin')
  createLegalEntity(
    @Body(new ZodValidationPipe(createLegalEntitySchema)) body: CreateLegalEntityDto,
  ) {
    this.logger.info('Endpoint createLegalEntity recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createLegalEntity',
      code: body.code,
    });
    return this.legal.createLegalEntity(body);
  }

  @Post('branches')
  createBranch(
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createBranch recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createBranch',
      code: body.code,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.legal.createBranch(body, user);
  }

  @Post('ledgers')
  createLedger(
    @Body(new ZodValidationPipe(createLedgerSchema)) body: CreateLedgerDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createLedger recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createLedger',
      code: body.code,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.legal.createLedger(body, user);
  }
}
