import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  AccountIdParamsDto,
  BulkCreateAccountsDto,
  CreateAccountDto,
  CreateContactDto,
  IdParamsDto,
  ListAccountsQueryDto,
  QualifyAccountDto,
  SetAccountDossierDto,
  SetAccountTaxIdDto,
} from '../b2b-sales-crm.dtos';
import {
  accountIdParamsSchema,
  bulkCreateAccountsSchema,
  createAccountSchema,
  createContactSchema,
  idParamsSchema,
  listAccountsQuerySchema,
  qualifyAccountSchema,
  setAccountDossierSchema,
  setAccountTaxIdSchema,
} from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';
import { MerchantFolderService } from '../../partner-onboarding-gateway/merchant-folder.service';

/** La cookie con el token de identidad de quien opera: AtlasBackend valida sus roles sobre esa persona. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

@Controller('b2b/accounts')
export class B2BAccountsController {
  constructor(
    private readonly service: B2BSalesCrmService,
    private readonly merchantFolder: MerchantFolderService,
  ) {}

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post()
  createAccount(
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.createAccount(body, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'OPERATIONS', 'ADMIN')
  @Get()
  listAccounts(
    @Query(new ZodValidationPipe(listAccountsQuerySchema)) query: ListAccountsQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.service.listAccounts(query);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE', 'LEGAL', 'OPERATIONS', 'ADMIN')
  @Get(':id')
  getAccount(
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.service.getAccount(params.id);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Post('bulk')
  bulkCreateAccounts(
    @Body(new ZodValidationPipe(bulkCreateAccountsSchema)) body: BulkCreateAccountsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.bulkCreateAccounts(body, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post(':accountId/contacts')
  createContact(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactDto,
  ): Promise<Record<string, unknown>> {
    return this.service.createContact(params.accountId, body);
  }

  // Completar el NIT de una cuenta que se creó sin él, cuando todavía era opcional: sin NIT no se
  // abre el onboarding ni la carpeta del comercio en Atlas. Lo corrige quien puede crear la cuenta.
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':accountId/tax-id')
  setAccountTaxId(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(setAccountTaxIdSchema)) body: SetAccountTaxIdDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.setAccountTaxId(params.accountId, body, user);
  }

  // Los datos del expediente (matrícula, representante, poder, QR) que la compuerta del onboarding
  // exige y que no se capturaron al registrar la empresa. Mismo permiso que corregir el NIT.
  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'OPERATIONS', 'ADMIN')
  @Patch(':accountId/dossier')
  async setAccountDossier(
    @Req() req: Request,
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(setAccountDossierSchema)) body: SetAccountDossierDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const cuenta = await this.service.setAccountDossier(params.accountId, body, user);
    /*
     * Si el comercio ya tiene expediente en Atlas (su onboarding se abrió antes), lo completado
     * aquí se le entrega EN EL ACTO. Sin esto el dato quedaba en la cuenta del ERP y el comercio
     * seguía viendo «Falta N requisitos» hasta un onboarding nuevo que nunca llega (2026-10-02,
     * Multicenter). Sin expediente todavía, se entrega al abrir el onboarding, como siempre.
     */
    if (!cuenta.partnerProfileId) return cuenta;
    const token = (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
    const carpeta = await this.merchantFolder.tryEnsureForAccount(params.accountId, token);
    return { ...cuenta, carpetaDelComercio: carpeta };
  }

  // Archivar/restaurar mueve una cuenta fuera o dentro de los listados: decisión de gestión, no de
  // un ejecutivo de línea. Por eso el permiso es el mismo que el de la carga masiva.
  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':accountId/archive')
  archiveAccount(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.archiveAccount(params.accountId, user);
  }

  @Roles('COMMERCIAL_MANAGER', 'ADMIN')
  @Patch(':accountId/restore')
  restoreAccount(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.restoreAccount(params.accountId, user);
  }

  @Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN')
  @Post(':accountId/qualify')
  qualifyAccount(
    @Param(new ZodValidationPipe(accountIdParamsSchema)) params: AccountIdParamsDto,
    @Body(new ZodValidationPipe(qualifyAccountSchema)) body: QualifyAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.qualifyAccount(params.accountId, body, user);
  }
}
