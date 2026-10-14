import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Header,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  CompleteChecklistItemDto,
  ChecklistItemIdParamsDto,
  ChecklistEvidenceUploadUrlDto,
  AttachChecklistEvidenceDto,
  CreateBranchDto,
  CreateMerchantUserDto,
  CreateOnboardingCaseDto,
  OnboardingCaseIdParamsDto,
  SetBranchStatusDto,
  UpdateBranchDto,
  BranchIdParamsDto,
  ListBranchesQueryDto,
  ListOnboardingCasesQueryDto,
  AssignCaseContractDto,
  CreateCaseMdrRuleDto,
  RequestKybReviewDto,
} from '../b2b-sales-crm.dtos';
import {
  branchIdParamsSchema,
  listBranchesQuerySchema,
  listOnboardingCasesQuerySchema,
  assignCaseContractSchema,
  createCaseMdrRuleSchema,
  requestKybReviewSchema,
  completeChecklistItemSchema,
  checklistItemIdParamsSchema,
  checklistEvidenceUploadUrlSchema,
  attachChecklistEvidenceSchema,
  createBranchSchema,
  createMerchantUserSchema,
  createOnboardingCaseSchema,
  onboardingCaseIdParamsSchema,
  setBranchStatusSchema,
  updateBranchSchema,
} from '../b2b-sales-crm.schemas';
import { PortalScopeService } from '../../portal/portal.scope.service';
import { KybVerificationService } from '../services/onboarding/kyb-verification.service';
import { MerchantActivationService } from '../services/onboarding/merchant-activation.service';
import { MerchantBranchesService } from '../services/onboarding/merchant-branches.service';
import { MerchantUserAccessService } from '../services/onboarding/merchant-user-access.service';
import { OnboardingCaseOpeningService } from '../services/onboarding/onboarding-case-opening.service';
import { OnboardingCaseQueryService } from '../services/onboarding/onboarding-case-query.service';
import { OnboardingChecklistService } from '../services/onboarding/onboarding-checklist.service';
import { OnboardingContractService } from '../services/onboarding/onboarding-contract.service';
import { OnboardingReconciliationService } from '../services/onboarding/onboarding-reconciliation.service';

/** Los roles de las rutas de sucursal que operan CUALQUIER comercio; el resto es el propio comercio. */
const BRANCH_STAFF_ROLES = ['OPERATIONS', 'ADMIN'] as const;

/**
 * Cookie del token de identidad upstream. Es la MISMA que emite el gateway de autenticación; aquí
 * sólo se lee, igual que en `partner-onboarding-gateway.controller.ts`.
 */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

@Controller('b2b/onboarding')
export class OnboardingController {
  constructor(
    private readonly opening: OnboardingCaseOpeningService,
    private readonly caseQuery: OnboardingCaseQueryService,
    private readonly branches: MerchantBranchesService,
    private readonly userAccess: MerchantUserAccessService,
    private readonly contracts: OnboardingContractService,
    private readonly kyb: KybVerificationService,
    private readonly reconciliation: OnboardingReconciliationService,
    private readonly checklist: OnboardingChecklistService,
    private readonly activation: MerchantActivationService,
    private readonly scope: PortalScopeService,
  ) {}

  /**
   * El token con el que este backend habla con AtlasBackend en nombre de quien llama.
   *
   * Se exige explícitamente en vez de degradar a una llamada sin identificar: encolar un alta de
   * acceso de forma anónima dejaría la petición sin autor, y el autor es medio expediente. El 401
   * es honesto —la sesión del ERP existe, la del proveedor de identidad no—, y se resuelve
   * volviendo a entrar.
   */
  private upstreamToken(req: Request): string {
    const token = (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException(
        'La sesión no lleva token de identidad de Atlas: vuelve a iniciar sesión para poder pedir un acceso de comercio.',
      );
    }
    return token;
  }

  /*
   * Lectura de la cola de onboarding. Faltaba: sin ella la pantalla no podia ofrecer un desplegable
   * y obligaba a teclear el uuid del caso, que nadie conoce de memoria.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases')
  listCases(
    @Query(new ZodValidationPipe(listOnboardingCasesQuerySchema))
    query: ListOnboardingCasesQueryDto,
  ): Promise<Record<string, unknown>> {
    return this.caseQuery.listOnboardingCases(query);
  }

  /*
   * Las cifras del mini-tablero. Va ANTES de `cases/:onboardingCaseId`: si no, «summary» cae en el
   * parámetro y el validador de uuid lo rechaza con un 400 que habla de otra cosa.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/summary')
  summarizeCases(): Promise<Record<string, unknown>> {
    return this.caseQuery.summarizeOnboardingQueue();
  }

  /**
   * El contrato legal por defecto que rige en Atlas (lo publica el portal interno). El ERP sólo lo
   * lee: sin él, el Motor no aprueba a nadie, y la cola tiene que poder decirlo.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Get('legal-contract-template')
  getDefaultLegalContractTemplate(@Req() req: Request): Promise<Record<string, unknown>> {
    return this.contracts.getDefaultLegalContractTemplate(this.upstreamToken(req));
  }

  /**
   * Acusar de una vez todo lo que espera a otro sistema: credenciales pendientes en el portal y
   * desenlaces del Motor. Una llamada por carga de la cola, en vez de una por fila.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/reconcile-pending')
  reconcilePendingCases(
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.reconcilePendingCases(this.upstreamToken(req), user);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/:onboardingCaseId')
  getCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.caseQuery.getOnboardingCase(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases')
  createCase(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createOnboardingCaseSchema)) body: CreateOnboardingCaseDto,
  ): Promise<Record<string, unknown>> {
    // Sin exigir el token: el caso se abre igual, y la carpeta del comercio en Atlas —que sí lo
    // necesita— dice en la respuesta por qué no se pudo asegurar.
    const token = (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
    return this.opening.createOnboardingCase(body, token);
  }

  /*
   * Editar y dar de baja una sucursal. Faltaban: solo se podian crear, nunca corregir ni cerrar.
   *
   * Habia DOS `@Roles` seguidos aqui y el de arriba ganaba, asi que `MERCHANT_ADMIN` —que el de
   * abajo si concedia— quedaba fuera sin que nada lo dijera: el comercio recibia 403 al corregir su
   * propia sucursal y el codigo leia como que si podia.
   */
  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId')
  async updateBranch(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.updateBranch(params.branchId, body, allowed);
  }

  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Patch('branches/:branchId/status')
  async setBranchStatus(
    @Param(new ZodValidationPipe(branchIdParamsSchema)) params: BranchIdParamsDto,
    @Body(new ZodValidationPipe(setBranchStatusSchema)) body: SetBranchStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.setBranchStatus(params.branchId, body, allowed);
  }

  /** Las sucursales, para poder elegir dónde se origina una venta a plazos. */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'FINANCE')
  @Get('branches')
  listBranches(
    @Query(new ZodValidationPipe(listBranchesQuerySchema)) query: ListBranchesQueryDto,
  ): Promise<Record<string, unknown>[]> {
    return this.branches.listBranches(query);
  }

  /* Faltaba el `@Roles`: sin él, cualquier sesión del ERP podía abrir sucursales a cualquier comercio. */
  @Roles('OPERATIONS', 'ADMIN', 'MERCHANT_ADMIN')
  @Post('branches')
  async createBranch(
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const allowed = await this.scope.restrictToOwnAccounts(user, BRANCH_STAFF_ROLES);
    return this.branches.createBranch(body, allowed);
  }

  /*
   * Registrar al usuario en el CRM Y pedir su acceso a Atlas, en un solo acto.
   *
   * La segunda mitad es la que faltaba: antes esta ruta creaba la membresía y la identidad con la
   * que esa persona inicia sesión se tecleaba aparte, en el portal interno, sin nada que atara una
   * cosa con la otra. Ver `MerchantUserAccessService.createMerchantUser`.
   */
  @Roles('OPERATIONS', 'ADMIN')
  @Post('merchant-users')
  createMerchantUser(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createMerchantUserSchema)) body: CreateMerchantUserDto,
  ): Promise<Record<string, unknown>> {
    return this.userAccess.createMerchantUser(body, this.upstreamToken(req));
  }

  /**
   * Preguntar a Atlas en qué quedó el acceso pedido y enlazar la identidad si ya se concedió.
   *
   * Es el cierre del circuito: sin esta llamada `user_id` se queda nulo y el alcance del portal del
   * comercio depende del enlace de respaldo por correo.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Patch('merchant-users/:merchantUserId/identity')
  syncMerchantUserIdentity(
    @Req() req: Request,
    @Param('merchantUserId') merchantUserId: string,
  ): Promise<Record<string, unknown>> {
    return this.userAccess.syncMerchantUserIdentity(merchantUserId, this.upstreamToken(req));
  }

  /*
   * El contrato y la comisión del alta, sobre el caso. Antes la comisión era una pestaña global
   * que pedía elegir el contrato otra vez en un desplegable, y el contrato del caso no se elegía
   * en ninguna parte: la activación miraba «el activo de la cuenta» y ya.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Get('cases/:onboardingCaseId/contract-options')
  listCaseContractOptions(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>[]> {
    return this.contracts.listCaseContractOptions(params.onboardingCaseId);
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Patch('cases/:onboardingCaseId/contract')
  assignCaseContract(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(assignCaseContractSchema)) body: AssignCaseContractDto,
  ): Promise<Record<string, unknown>> {
    return this.contracts.assignCaseContract(params.onboardingCaseId, body);
  }

  /* Mismos roles que `POST /b2b/contracts/mdr-rules`: es la misma decisión, dicha desde el caso. */
  @Roles('COMMERCIAL_MANAGER', 'FINANCE', 'ADMIN')
  @Post('cases/:onboardingCaseId/mdr-rules')
  createCaseMdrRule(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(createCaseMdrRuleSchema)) body: CreateCaseMdrRuleDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.contracts.createCaseMdrRule(params.onboardingCaseId, body, user);
  }

  /*
   * El tramo del Motor. El ERP PIDE la verificación; decide AtlasBackend con el artefacto
   * PARTNER_KYB_REVIEW, y es el único origen de esa decisión. Antes la activación no preguntaba a
   * nadie: checklist + contrato y adelante.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Post('cases/:onboardingCaseId/partner-link')
  linkPartnerProfile(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.kyb.linkPartnerProfile(params.onboardingCaseId, this.upstreamToken(req));
  }

  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Post('cases/:onboardingCaseId/kyb-review')
  requestKybReview(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(requestKybReviewSchema)) body: RequestKybReviewDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.kyb.requestKybReview(params.onboardingCaseId, body, this.upstreamToken(req), user);
  }

  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/:onboardingCaseId/kyb-review/sync')
  syncKybDecision(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.kyb.syncKybDecision(params.onboardingCaseId, this.upstreamToken(req));
  }

  /**
   * El acuse de las credenciales: el ERP pregunta a Atlas en qué quedó cada petición del comercio
   * y lo aplica al caso. Es lo que antes había que hacer usuario por usuario, acordándose.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Post('cases/:onboardingCaseId/identity/reconcile')
  reconcileCaseIdentity(
    @Req() req: Request,
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.reconciliation.reconcileCaseIdentity(
      params.onboardingCaseId,
      this.upstreamToken(req),
      user,
    );
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Patch('cases/:onboardingCaseId/checklist')
  completeChecklistItem(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(completeChecklistItemSchema)) body: CompleteChecklistItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.checklist.completeChecklistItem(params.onboardingCaseId, body, user);
  }

  /*
   * El archivo del requisito. Tres pasos, como el poder del comercio: permiso firmado que emite
   * AtlasBackend, subida directa del navegador al almacén, y registro aquí tras la verificación
   * del objeto. Los bytes se sirven con la sesión, nunca por URL.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases/:onboardingCaseId/checklist/:checklistItemId/evidence/upload-url')
  checklistEvidenceUploadUrl(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Body(new ZodValidationPipe(checklistEvidenceUploadUrlSchema))
    body: ChecklistEvidenceUploadUrlDto,
  ): Promise<Record<string, unknown>> {
    return this.checklist.createChecklistEvidenceUploadUrl(
      params.onboardingCaseId,
      params.checklistItemId,
      body,
      this.upstreamToken(req),
    );
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases/:onboardingCaseId/checklist/:checklistItemId/evidence')
  attachChecklistEvidence(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Body(new ZodValidationPipe(attachChecklistEvidenceSchema)) body: AttachChecklistEvidenceDto,
  ): Promise<Record<string, unknown>> {
    return this.checklist.attachChecklistEvidence(
      params.onboardingCaseId,
      params.checklistItemId,
      body,
      this.upstreamToken(req),
    );
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Get('cases/:onboardingCaseId/checklist/:checklistItemId/evidence/content')
  @Header('Cache-Control', 'private, max-age=60')
  async checklistEvidenceContent(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.checklist.readChecklistEvidence(
      params.onboardingCaseId,
      params.checklistItemId,
      this.upstreamToken(req),
    );
    res.setHeader('Content-Type', archivo.contentType);
    return new StreamableFile(archivo.buffer);
  }

  @Roles('OPERATIONS', 'ADMIN')
  @Patch('cases/:onboardingCaseId/activate')
  activateCase(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
  ): Promise<Record<string, unknown>> {
    return this.activation.activateOnboardingCase(params.onboardingCaseId);
  }
}
