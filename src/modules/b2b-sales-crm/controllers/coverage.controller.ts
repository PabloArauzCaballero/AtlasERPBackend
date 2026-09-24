import { Get, Body, Controller, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  ApplyRecoveryPaymentDto,
  CancelPayableDto,
  DecidePayableSettlementDto,
  MarkPayablePaidDto,
  PayableIdParamsDto,
  RecoveryIdParamsDto,
  RecoveryMovementParamsDto,
  RejectPayableSettlementDto,
  ReverseRecoveryMovementDto,
  ScheduleCoverageDto,
} from '../b2b-sales-crm.dtos';
import {
  applyRecoveryPaymentSchema,
  cancelPayableSchema,
  decidePayableSettlementSchema,
  markPayablePaidSchema,
  payableIdParamsSchema,
  recoveryIdParamsSchema,
  recoveryMovementParamsSchema,
  rejectPayableSettlementSchema,
  reverseRecoveryMovementSchema,
  scheduleCoverageSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';
import type { OverdueSweepResult } from '../services/b2b-overdue-sweep.service';

@Controller('b2b/coverage')
export class CoverageController {
  constructor(private readonly service: B2BSalesCrmService) {}

  /*
   * Lectura de las piezas de la conciliacion. Faltaba, y por eso la pantalla pedia tres uuids
   * tecleados: cuota, payable y recuperacion. Solo se obtenian copiandolos de otra respuesta.
   */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('installments')
  listInstallments(): Promise<Record<string, unknown>[]> {
    return this.service.listInstallments();
  }

  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('payables')
  listPayables(): Promise<Record<string, unknown>[]> {
    return this.service.listPayables();
  }

  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('recoveries')
  listRecoveries(): Promise<Record<string, unknown>[]> {
    return this.service.listRecoveries();
  }

  /** Cola de revisión: avisos de pago sin verificar a tiempo y coberturas que no se aprueban solas. */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Get('review-queue')
  listReviewQueue(): Promise<Record<string, unknown>[]> {
    return this.service.listCoverageReviewQueue();
  }

  @Roles('FINANCE', 'COLLECTIONS', 'ADMIN')
  @Get('recoveries/:recoveryId/movements')
  listRecoveryMovements(
    @Param(new ZodValidationPipe(recoveryIdParamsSchema)) params: RecoveryIdParamsDto,
  ): Promise<Record<string, unknown>[]> {
    return this.service.listRecoveryMovements(params.recoveryId);
  }

  /*
   * La pasada de vencidas a demanda. Corre sola cada hora dentro del API; esto es para no esperar
   * después de cargar cuotas o de corregir una fecha.
   */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Post('installments/sweep-overdue')
  sweepOverdue(): Promise<OverdueSweepResult> {
    return this.service.sweepOverdueInstallments();
  }

  /**
   * 201 con la CxP si la cuota es elegible; 202 con el elemento de revisión si hay algo que una
   * persona debe mirar (aviso de pago sin confirmar, contrato no activo); 409 si no hay nada que
   * cubrir (futura, pagada, cancelada, ya cubierta), sin mutar nada.
   */
  @Roles('FINANCE', 'OPERATIONS', 'ADMIN')
  @Post('payables')
  async scheduleCoverage(
    @Body(new ZodValidationPipe(scheduleCoverageSchema)) body: ScheduleCoverageDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.service.scheduleCoverage(body, user);
    if (result.outcome === 'REVIEW_REQUIRED') res.status(202);
    return result;
  }

  @Roles('FINANCE', 'ADMIN')
  @Patch('payables/:payableId/cancel')
  cancelPayable(
    @Param(new ZodValidationPipe(payableIdParamsSchema)) params: PayableIdParamsDto,
    @Body(new ZodValidationPipe(cancelPayableSchema)) body: CancelPayableDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.cancelPayable(params.payableId, body, user);
  }

  /**
   * Registra la liquidación al comercio (referencia, importe, moneda, beneficiario, fecha y
   * evidencia). 202: queda PENDING_APPROVAL hasta que OTRA persona la confirme. Un cuerpo con sólo
   * `paidAt` —el contrato anterior— responde 400.
   */
  @Roles('FINANCE', 'ADMIN')
  @Patch('payables/:payableId/paid')
  @HttpCode(202)
  markPaid(
    @Param(new ZodValidationPipe(payableIdParamsSchema)) params: PayableIdParamsDto,
    @Body(new ZodValidationPipe(markPayablePaidSchema)) body: MarkPayablePaidDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.markPayablePaid(params.payableId, body, user);
  }

  /** Segunda firma: confirma la liquidación y hace nacer la CxC de recuperación. */
  @Roles('FINANCE', 'ADMIN')
  @Patch('payables/:payableId/settlement/approve')
  approveSettlement(
    @Param(new ZodValidationPipe(payableIdParamsSchema)) params: PayableIdParamsDto,
    @Body(new ZodValidationPipe(decidePayableSettlementSchema)) body: DecidePayableSettlementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.approvePayableSettlement(params.payableId, body, user);
  }

  @Roles('FINANCE', 'ADMIN')
  @Patch('payables/:payableId/settlement/reject')
  rejectSettlement(
    @Param(new ZodValidationPipe(payableIdParamsSchema)) params: PayableIdParamsDto,
    @Body(new ZodValidationPipe(rejectPayableSettlementSchema)) body: RejectPayableSettlementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.rejectPayableSettlement(params.payableId, body, user);
  }

  @Roles('FINANCE', 'COLLECTIONS', 'ADMIN')
  @Patch('recoveries/:recoveryId/apply-payment')
  applyRecoveryPayment(
    @Param(new ZodValidationPipe(recoveryIdParamsSchema)) params: RecoveryIdParamsDto,
    @Body(new ZodValidationPipe(applyRecoveryPaymentSchema)) body: ApplyRecoveryPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.applyRecoveryPayment(params.recoveryId, body, user);
  }

  /** Reverso/devolución de un cobro: movimiento compensatorio, el original se conserva. */
  @Roles('FINANCE', 'ADMIN')
  @Post('recoveries/:recoveryId/movements/:movementId/reverse')
  reverseRecoveryMovement(
    @Param(new ZodValidationPipe(recoveryMovementParamsSchema)) params: RecoveryMovementParamsDto,
    @Body(new ZodValidationPipe(reverseRecoveryMovementSchema)) body: ReverseRecoveryMovementDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.reverseRecoveryMovement(params.recoveryId, params.movementId, body, user);
  }
}
