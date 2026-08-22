import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  AccountIdParamsDto,
  RatingHistoryQueryDto,
  RatingSweepDto,
} from '../b2b-sales-crm.dtos';
import {
  accountIdParamsSchema,
  ratingHistoryQuerySchema,
  ratingSweepSchema,
} from '../b2b-sales-crm.schemas';
import { B2BCreditRatingQueryService } from '../services/b2b-credit-rating-query.service';
import { B2BCreditRatingService } from '../services/b2b-credit-rating.service';

/**
 * Calificación de riesgo de la cartera B2B.
 *
 * Roles de FINANZAS, COBRANZAS y RIESGO además de la gerencia comercial: la calificación es la base
 * de la previsión contable y de la decisión de línea, no un dato de venta. `MERCHANT_ADMIN` queda
 * fuera a propósito — enseñar el umbral exacto a quien tiene incentivo para quedar justo por encima
 * convierte la matriz en una guía para eludirla.
 */
@Controller('b2b/credit-rating')
export class CreditRatingController {
  constructor(
    private readonly rating: B2BCreditRatingService,
    private readonly queries: B2BCreditRatingQueryService,
  ) {}

  /** Recalifica cada cuenta por cobrar abierta del cliente y vuelve a derivar su categoría. */
  @Roles('FINANCE', 'COLLECTIONS', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post('accounts/:accountId/rate')
  @HttpCode(HttpStatus.OK)
  rateAccount(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.rating.rateAccountById(params.accountId) as Promise<Record<string, unknown>>;
  }

  /** Calificación vigente del cliente, con el detalle de las deudas que la produjeron. */
  @Roles(
    'FINANCE',
    'COLLECTIONS',
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'ACCOUNTANT',
    'ADMIN',
  )
  @Get('accounts/:accountId')
  getAccountRating(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.queries.getAccountRating(params.accountId);
  }

  /** Cómo migró de categoría a lo largo del tiempo, con la política vigente en cada corte. */
  @Roles('FINANCE', 'COLLECTIONS', 'COMMERCIAL_MANAGER', 'ACCOUNTANT', 'ADMIN')
  @Get('accounts/:accountId/history')
  getAccountRatingHistory(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Query(new ZodValidationPipe(ratingHistoryQuerySchema)) query: RatingHistoryQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.queries.getAccountRatingHistory(params.accountId, query.limit);
  }

  /**
   * Recalifica toda la cartera.
   *
   * Se expone como endpoint —y no sólo como trabajo programado— porque finanzas necesita poder
   * forzarlo antes de un cierre o después de activar una política nueva.
   */
  @Roles('FINANCE', 'ADMIN')
  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  sweep(
    @Body(new ZodValidationPipe(ratingSweepSchema)) body: RatingSweepDto,
  ): Promise<Record<string, unknown>> {
    return this.rating.sweep(body.limit) as Promise<Record<string, unknown>>;
  }

  /** Cuántas deudas, cuánta exposición y cuánta previsión hay en cada categoría. */
  @Roles('FINANCE', 'COLLECTIONS', 'ACCOUNTANT', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Get('portfolio-summary')
  getPortfolioSummary(): Promise<Record<string, unknown>> {
    return this.queries.getPortfolioSummary();
  }
}
