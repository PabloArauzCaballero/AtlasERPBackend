import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { idParamsSchema, type IdParamsDto } from '../shared/schemas/accounting.schemas';
import {
  createSupplierPaymentTermsSchema,
  listSupplierPaymentTermsQuerySchema,
  simulateSupplierScheduleSchema,
  updateSupplierPaymentTermsSchema,
  type CreateSupplierPaymentTermsDto,
  type ListSupplierPaymentTermsQueryDto,
  type SimulateSupplierScheduleDto,
  type UpdateSupplierPaymentTermsDto,
} from './supplier-payment-terms.schemas';
import { SupplierPaymentTermsService } from './supplier-payment-terms.service';

/**
 * Condiciones de pago a proveedor.
 *
 * `treasury` entra además de contabilidad porque quien ejecuta la corrida de pagos necesita ver con
 * qué condición vence cada factura; pactarlas y modificarlas se queda en contabilidad y dirección
 * financiera, que es donde se negocia.
 */
@Roles('admin', 'accountant', 'treasury', 'cfo')
@Controller('accounting/supplier-payment-terms')
export class SupplierPaymentTermsController {
  constructor(private readonly service: SupplierPaymentTermsService) {}

  /** El vocabulario con su explicación. Va antes de `:id` o «catalog» encajaría en el parámetro. */
  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listSupplierPaymentTermsQuerySchema))
    query: ListSupplierPaymentTermsQueryDto,
  ) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto) {
    return this.service.get(params.id);
  }

  @Roles('admin', 'accountant', 'cfo')
  @Post()
  create(
    @Body(new ZodValidationPipe(createSupplierPaymentTermsSchema))
    body: CreateSupplierPaymentTermsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(body, user?.sub);
  }

  @Roles('admin', 'accountant', 'cfo')
  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateSupplierPaymentTermsSchema))
    body: UpdateSupplierPaymentTermsDto,
  ) {
    return this.service.update(params.id, body);
  }

  /**
   * En qué fecha vence una factura con ESTA condición y cuánto se adelanta.
   *
   * No modifica nada: es `POST` porque la simulación lleva cuerpo —fecha de factura, recepción e
   * importe—, no porque escriba.
   */
  @Post(':id/simulate')
  simulate(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(simulateSupplierScheduleSchema)) body: SimulateSupplierScheduleDto,
  ) {
    return this.service.simulate(params.id, body);
  }
}
