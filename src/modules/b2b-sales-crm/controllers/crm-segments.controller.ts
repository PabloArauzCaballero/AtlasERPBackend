import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CreateCrmSegmentDto,
  IdParamsDto,
  ListCrmSegmentsQueryDto,
  UpdateCrmSegmentDto,
} from '../b2b-sales-crm.dtos';
import {
  createCrmSegmentSchema,
  idParamsSchema,
  listCrmSegmentsQuerySchema,
  updateCrmSegmentSchema,
} from '../b2b-sales-crm.schemas';
import { segmentVocabulary } from '../domain/crm-segments';
import { CrmSegmentsService, type CrmSegmentView } from '../services/crm-segments.service';

/**
 * Segmentos comerciales: clientes solicitantes de crédito y partners.
 *
 * `MERCHANT_ADMIN` queda fuera de todo, también de la lectura: el catálogo dice con qué criterios
 * se clasifica a los propios comercios —nivel de riesgo, deuda abierta, banda de tamaño—, y
 * enseñárselo a quien está clasificado convierte los cortes en una guía para quedar del lado
 * conveniente. Es el mismo criterio que ya rige en la calificación de riesgo.
 *
 * No confundir con `/admin/ads/segments`: aquello es audiencia publicitaria —a quién se le SIRVE
 * un anuncio— y esto es población comercial. Ni con `/internal/users`, que son los usuarios del
 * propio ERP: esos no se segmentan, se administran.
 */
@Controller('b2b/segments')
export class CrmSegmentsController {
  constructor(private readonly service: CrmSegmentsService) {}

  /** Qué puede mirar un segmento de cada sujeto. Es lo que llena el desplegable del alta. */
  @Roles(
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'FINANCE',
    'COLLECTIONS',
    'OPERATIONS',
    'ADMIN',
  )
  @Get('vocabulary')
  vocabulary() {
    return segmentVocabulary();
  }

  @Roles(
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'FINANCE',
    'COLLECTIONS',
    'OPERATIONS',
    'ADMIN',
  )
  @Get()
  list(
    @Query(new ZodValidationPipe(listCrmSegmentsQuerySchema)) query: ListCrmSegmentsQueryDto,
  ): Promise<CrmSegmentView[]> {
    return this.service.list(query);
  }

  @Roles(
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'FINANCE',
    'COLLECTIONS',
    'OPERATIONS',
    'ADMIN',
  )
  @Get(':id')
  get(@Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto): Promise<CrmSegmentView> {
    return this.service.get(params.id);
  }

  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Post()
  create(
    @Body(new ZodValidationPipe(createCrmSegmentSchema)) body: CreateCrmSegmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CrmSegmentView> {
    return this.service.create(body, user);
  }

  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
    @Body(new ZodValidationPipe(updateCrmSegmentSchema)) body: UpdateCrmSegmentDto,
  ): Promise<CrmSegmentView> {
    return this.service.update(params.id, body);
  }

  /**
   * Borrar un segmento no toca a nadie: es un criterio, no un vínculo. Ninguna cuenta ni ningún
   * cliente cambia por perderlo, y por eso no hace falta `force` como en los tags.
   */
  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Delete(':id')
  remove(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
  ): Promise<{ id: string; name: string }> {
    return this.service.remove(params.id);
  }
}
