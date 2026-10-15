import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import {
  CreateAccountingPeriodDto,
  CreateFiscalYearDto,
  createAccountingPeriodSchema,
  createFiscalYearSchema,
} from '../../shared/schemas/accounting.schemas';
import { FiscalCalendarService } from '../services/fiscal-calendar.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/financial-structure')
export class FinancialStructureCalendarController {
  constructor(
    private readonly calendar: FiscalCalendarService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get('fiscal-years')
  listFiscalYears(@CurrentUser() user: AuthUser) {
    return this.calendar.listFiscalYears(user);
  }

  @Get('periods')
  listAccountingPeriods(@CurrentUser() user: AuthUser) {
    return this.calendar.listAccountingPeriods(user);
  }

  @Post('fiscal-years')
  createFiscalYear(
    @Body(new ZodValidationPipe(createFiscalYearSchema)) body: CreateFiscalYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createFiscalYear recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createFiscalYear',
      yearLabel: body.yearLabel,
      legalEntityId: body.legalEntityId,
      userId: user.sub,
    });
    return this.calendar.createFiscalYear(body, user);
  }

  @Post('periods')
  createAccountingPeriod(
    @Body(new ZodValidationPipe(createAccountingPeriodSchema)) body: CreateAccountingPeriodDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint createAccountingPeriod recibido.', {
      layer: 'controller',
      module: 'financial-structure',
      action: 'createAccountingPeriod',
      periodNo: body.periodNo,
      fiscalYearId: body.fiscalYearId,
      userId: user.sub,
    });
    return this.calendar.createAccountingPeriod(body, user);
  }
}
