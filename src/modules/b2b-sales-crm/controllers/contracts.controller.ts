import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  ContractIdParamsDto,
  CreateContractFromProposalDto,
  SignContractDto,
} from '../b2b-sales-crm.dtos';
import {
  contractIdParamsSchema,
  createContractFromProposalSchema,
  signContractSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/contracts')
export class ContractsController {
  constructor(private readonly service: B2BSalesCrmService) {}

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
