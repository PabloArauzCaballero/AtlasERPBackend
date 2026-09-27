import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { SiatCatalogSyncService } from '../application/siat-catalog-sync.service';
import { SiatCredentialsService } from '../application/siat-credentials.service';
import { SiatIssuerProfileService } from '../application/siat-issuer-profile.service';
import { SiatStatusService } from '../application/siat-status.service';
import { SiatGatewayService } from '../application/siat-gateway.service';
import { facturacionFiscalApagada } from '../application/siat-errors';
import {
  CreateIssuerProfileDto,
  createIssuerProfileSchema,
  SyncCatalogsDto,
  syncCatalogsSchema,
  UpdateIssuerProfileDto,
  updateIssuerProfileSchema,
} from '../fiscal-siat.schemas';
import type { CodigoCatalogoSin } from '../application/siat-catalog-sync.service';

/**
 * Facturación electrónica: emisor ante el SIN, credenciales (CUIS/CUFD), catálogos y estado.
 * Todo acotado por entidad legal. Ninguna ruta acepta un escenario del emulador: eso sólo lo
 * deciden las pruebas.
 */
@Roles('admin', 'accountant')
@Controller('accounting/fiscal')
export class FiscalSiatController {
  constructor(
    private readonly profiles: SiatIssuerProfileService,
    private readonly credentials: SiatCredentialsService,
    private readonly catalogs: SiatCatalogSyncService,
    private readonly status: SiatStatusService,
    private readonly gateway: SiatGatewayService,
  ) {}

  @Get('issuer-profiles')
  listProfiles(@CurrentUser() user: AuthUser) {
    return this.profiles.listar(user);
  }

  @Post('issuer-profiles')
  createProfile(
    @Body(new ZodValidationPipe(createIssuerProfileSchema)) body: CreateIssuerProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.crear(body, user);
  }

  @Patch('issuer-profiles/:id')
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateIssuerProfileSchema)) body: UpdateIssuerProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.actualizar(id, body, user);
  }

  @Get('issuer-profiles/:id/status')
  async profileStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.status.estado(await this.profiles.obtener(id, user));
  }

  @Post('issuer-profiles/:id/cuis')
  async requestCuis(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    this.exigirActivo();
    const cuis = await this.credentials.cuisVigente(await this.profiles.obtener(id, user), true);
    return { id: cuis.id, fechaVigencia: cuis.fechaVigencia, obtenidoEn: cuis.obtainedAt };
  }

  @Post('issuer-profiles/:id/cufd')
  async requestCufd(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    this.exigirActivo();
    const cufd = await this.credentials.cufdVigente(await this.profiles.obtener(id, user), true);
    // El código y su control no salen del servidor: sólo se enseña la vigencia.
    return { id: cufd.id, fechaVigencia: cufd.fechaVigencia, obtenidoEn: cufd.obtainedAt };
  }

  @Post('issuer-profiles/:id/catalogs/sync')
  async syncCatalogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(syncCatalogsSchema)) body: SyncCatalogsDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.exigirActivo();
    return this.catalogs.sincronizar(
      await this.profiles.obtener(id, user),
      body.catalogo as CodigoCatalogoSin | undefined,
    );
  }

  @Get('catalogs/:code')
  listCatalog(@Param('code') code: string) {
    return this.catalogs.listar(code.toUpperCase());
  }

  @Get('status')
  modeStatus() {
    return { mode: this.gateway.modo, activo: this.gateway.activo };
  }

  private exigirActivo() {
    if (!this.gateway.activo) throw facturacionFiscalApagada();
  }
}
