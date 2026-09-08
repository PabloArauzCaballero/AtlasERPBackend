import { Get, Body, Controller, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  ContractIdParamsDto,
  CreateContractFromProposalDto,
  CreateMdrRuleDto,
  MdrRuleIdParamsDto,
  SignContractDto,
  UpdateMdrRuleDto,
} from '../b2b-sales-crm.dtos';
import {
  contractIdParamsSchema,
  createContractFromProposalSchema,
  createMdrRuleSchema,
  mdrRuleIdParamsSchema,
  signContractSchema,
  updateMdrRuleSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/contracts')
export class ContractsController {
  constructor(private readonly service: B2BSalesCrmService) {}

  /*
   * Las reglas de comision (MDR). No habia NINGUN endpoint: solo se podian crear por SQL, asi que
   * cambiar cuanto cobra Atlas por una venta exigia entrar a la base de datos.
   *
   * Habia DOS `@Roles` apilados aqui: el de arriba —el de `listContracts`, que quedo separado de su
   * ruta por este comentario— ganaba, asi que las reglas las leia tambien LEGAL y el ejecutivo
   * comercial, y `GET /b2b/contracts` se quedo SIN roles. `RolesGuard` sin metadatos deja pasar,
   * de modo que cualquier sesion autenticada del ERP —el dueño de un comercio incluido— listaba los
   * contratos de todos. Es el mismo patron ya corregido en `onboarding.controller.ts`.
   */
  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Get('mdr-rules')
  listMdrRules(
    @Query('contractVersionId') contractVersionId?: string,
  ): Promise<Record<string, unknown>[]> {
    return this.service.listMdrRules(contractVersionId);
  }

  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Post('mdr-rules')
  createMdrRule(
    @Body(new ZodValidationPipe(createMdrRuleSchema)) body: CreateMdrRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createMdrRule(body);
  }

  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Patch('mdr-rules/:ruleId')
  updateMdrRule(
    @Param(new ZodValidationPipe(mdrRuleIdParamsSchema)) params: MdrRuleIdParamsDto,
    @Body(new ZodValidationPipe(updateMdrRuleSchema)) body: UpdateMdrRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.service.updateMdrRule(params.ruleId, body);
  }

  /* Lectura de contratos, para poder ELEGIR uno en vez de teclear su uuid. */
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'LEGAL', 'FINANCE', 'ADMIN')
  @Get()
  listContracts(): Promise<Record<string, unknown>[]> {
    return this.service.listContracts();
  }

  @Roles('LEGAL', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post('from-proposal')
  createFromProposal(
    @Body(new ZodValidationPipe(createContractFromProposalSchema))
    body: CreateContractFromProposalDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createContractFromProposal(body);
  }

  @Roles('LEGAL', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':contractId/sign-and-activate')
  signAndActivate(
    @Param(new ZodValidationPipe(contractIdParamsSchema)) params: ContractIdParamsDto,
    @Body(new ZodValidationPipe(signContractSchema)) body: SignContractDto,
  ): Promise<Record<string, unknown>> {
    return this.service.signAndActivateContract(params.contractId, body);
  }
}
