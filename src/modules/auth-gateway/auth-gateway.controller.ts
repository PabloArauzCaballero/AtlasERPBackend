import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { env } from '../../config/env';
import { AuthGatewayService } from './auth-gateway.service';
import type { AuthSessionResult } from './auth-gateway.service';
import {
  internalRoleIdParamsSchema,
  internalUserIdParamsSchema,
  loginPinSchema,
  loginSchema,
  logoutSchema,
  merchantLoginSchema,
  merchantPasswordResetConfirmSchema,
  merchantPasswordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  passwordChangeConfirmSchema,
  passwordChangeRequestSchema,
  replaceInternalUserRolesSchema,
  updateInternalUserSchema,
} from './auth-gateway.schemas';
import type {
  InternalRoleIdParamsDto,
  InternalUserIdParamsDto,
  LoginDto,
  LoginPinDto,
  LogoutDto,
  MerchantLoginDto,
  MerchantPasswordResetConfirmDto,
  MerchantPasswordResetRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  PasswordChangeConfirmDto,
  PasswordChangeRequestDto,
  ReplaceInternalUserRolesDto,
  UpdateInternalUserDto,
} from './auth-gateway.schemas';
import type { RefreshedUpstreamTokens, UpstreamTokens } from './auth-gateway.types';
import { isPinChallenge } from './auth-gateway.types';

const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';
const UPSTREAM_REFRESH_COOKIE = 'atlas_upstream_rt';

/**
 * Alcance del token de ACCESO upstream: todo el prefijo de la API.
 *
 * Estaba limitado a `/api/v1/auth`, y esa restricción dejaba de tener sentido en cuanto este
 * backend empezó a hacer de pasarela de dominio hacia AtlasBackend —el expediente del partner—:
 * el navegador simplemente no manda la cookie a una ruta fuera de su `path`, así que la pasarela
 * se quedaba sin credencial y la única salida habría sido darle una credencial de MÁQUINA, capaz
 * de operar el expediente de cualquier comercio.
 *
 * Se amplía el de acceso y **no** el de refresco, que es el que de verdad importa: el de acceso
 * dura una hora y sólo sirve para actuar como quien ya inició sesión; el de refresco emite
 * sesiones nuevas y sigue confinado a `/api/v1/auth`. Lo que protegía la restricción original
 * —que JS no pueda leerla y que no viaje a otro origen— lo siguen dando `httpOnly`, `secure` y
 * `sameSite`, que no se tocan.
 */
const UPSTREAM_ACCESS_COOKIE_PATH = '/api/v1';
/** El de refresco no se amplía: emite sesiones, y sólo el gateway de autenticación lo necesita. */
const UPSTREAM_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly service: AuthGatewayService) {}

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.service.login(body.email, body.password);
    // Con el segundo factor pendiente no hay sesión que guardar: ni cookies upstream ni token del
    // ERP. El desafío viaja al front tal cual, y la sesión nace en `login/pin`.
    if (isPinChallenge(outcome)) return outcome;
    return this.issueSession(res, outcome);
  }

  @Public()
  @Post('login/pin')
  async loginPin(
    @Body(new ZodValidationPipe(loginPinSchema)) body: LoginPinDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.issueSession(res, await this.service.loginPin(body.challengeToken, body.pin));
  }

  /**
   * Cambio de contraseña del usuario autenticado, en dos pasos contra AtlasBackend.
   *
   * No lleva `@Roles`: cualquier usuario con sesión puede cambiar SU propia contraseña, y quién es
   * lo decide el token upstream de la cookie, no el cuerpo.
   */
  @Post('password/change/request')
  async requestPasswordChange(
    @Body(new ZodValidationPipe(passwordChangeRequestSchema)) body: PasswordChangeRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.requestPasswordChange(
      this.readUpstreamTokens(req),
      body.currentPassword,
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @Post('password/change/confirm')
  async confirmPasswordChange(
    @Body(new ZodValidationPipe(passwordChangeConfirmSchema)) body: PasswordChangeConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result } = await this.service.confirmPasswordChange(this.readUpstreamTokens(req), body);
    // AtlasBackend revoca TODA sesión del actor al cambiar la contraseña, incluida ésta. Dejar las
    // cookies upstream puestas sólo serviría para que la siguiente llamada fallara con un 401
    // inexplicable: se limpian aquí y el front manda al login.
    this.clearUpstreamCookies(res);
    return result;
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.refresh(this.readCookie(req, UPSTREAM_REFRESH_COOKIE));
    this.setUpstreamCookies(res, {
      accessToken: session.upstreamAccessToken,
      refreshToken: session.upstreamRefreshToken,
    });
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  @Public()
  @Post('logout')
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.logout(
      this.readCookie(req, UPSTREAM_REFRESH_COOKIE),
      body.allDevices,
    );
    this.clearUpstreamCookies(res);
    return result;
  }

  // ---- Canal del comercio afiliado -------------------------------------------------------------
  // Rutas separadas del login interno a propósito: son dos poblaciones distintas y mezclarlas en
  // un mismo endpoint acabaría con un `if` decidiendo quién eres, que es justo el error que este
  // trabajo corrige.

  @Public()
  @Post('merchant/login')
  async merchantLogin(
    @Body(new ZodValidationPipe(merchantLoginSchema)) body: MerchantLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.service.merchantLogin(body.email, body.password);
    this.setUpstreamCookies(res, {
      accessToken: session.upstreamAccessToken,
      refreshToken: session.upstreamRefreshToken,
    });
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  @Public()
  @Post('merchant/refresh')
  async merchantRefresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.merchantRefresh(
      this.readCookie(req, UPSTREAM_REFRESH_COOKIE),
    );
    this.setUpstreamCookies(res, {
      accessToken: session.upstreamAccessToken,
      refreshToken: session.upstreamRefreshToken,
    });
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  @Roles('MERCHANT_ADMIN')
  @Get('merchant/me')
  async merchantMe(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.merchantMe(this.readUpstreamTokens(req));
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  /**
   * «Olvidé mi contraseña» del comercio: público y en dos pasos, porque quien lo pide no puede
   * entrar. Distinto de `password/change/*`, que exige sesión y la contraseña actual.
   *
   * La respuesta es siempre la misma exista o no la cuenta —la decide AtlasBackend— para que el
   * portal no sirva de comprobador de qué correos son de un comercio afiliado.
   */
  /**
   * «Olvidé mi contraseña» del PERSONAL INTERNO. Ruta separada de la del comercio a propósito: a
   * quién se le cambia la contraseña lo decide la ruta y no el cuerpo, así que desde el portal del
   * comercio no se puede sondear qué correos son de personal de Atlas, ni al revés.
   *
   * No sustituye al segundo factor: tras poner la contraseña nueva, entrar sigue pidiendo el PIN
   * que llega al correo.
   */
  @Public()
  @Post('password-reset/request')
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) body: PasswordResetRequestDto,
  ) {
    return this.service.requestInternalPasswordReset(body.email);
  }

  @Public()
  @Post('password-reset/confirm')
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema)) body: PasswordResetConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.confirmInternalPasswordReset(body);
    // Igual que en el canal del comercio: arriba quedaron revocadas TODAS las sesiones, así que
    // dejar cookies upstream puestas sólo daría un 401 inexplicable en la siguiente llamada.
    this.clearUpstreamCookies(res);
    return result;
  }

  @Public()
  @Post('merchant/password-reset/request')
  async requestMerchantPasswordReset(
    @Body(new ZodValidationPipe(merchantPasswordResetRequestSchema))
    body: MerchantPasswordResetRequestDto,
  ) {
    return this.service.requestMerchantPasswordReset(body.email);
  }

  /**
   * Segundo paso. No emite sesión a propósito: al confirmar, AtlasBackend revoca TODAS las sesiones
   * del comercio, así que devolver una aquí sería devolver una ya muerta. El portal manda al login.
   */
  @Public()
  @Post('merchant/password-reset/confirm')
  async confirmMerchantPasswordReset(
    @Body(new ZodValidationPipe(merchantPasswordResetConfirmSchema))
    body: MerchantPasswordResetConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.confirmMerchantPasswordReset(body);
    // Por si el navegador arrastraba cookies upstream de una sesión anterior del comercio: acaban
    // de quedar revocadas y dejarlas puestas sólo daría un 401 inexplicable en la próxima llamada.
    this.clearUpstreamCookies(res);
    return result;
  }

  @Public()
  @Post('merchant/logout')
  async merchantLogout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.merchantLogout(
      this.readCookie(req, UPSTREAM_REFRESH_COOKIE),
      body.allDevices,
    );
    this.clearUpstreamCookies(res);
    return result;
  }

  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.me(this.readUpstreamTokens(req));
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('users')
  async listUsers(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listUsers(this.readUpstreamTokens(req));
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { items: result };
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('users/:id')
  async getUser(
    @Param(new ZodValidationPipe(internalUserIdParamsSchema)) params: InternalUserIdParamsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.getUser(
      this.readUpstreamTokens(req),
      params.id,
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  async updateUser(
    @Param(new ZodValidationPipe(internalUserIdParamsSchema)) params: InternalUserIdParamsDto,
    @Body(new ZodValidationPipe(updateInternalUserSchema)) body: UpdateInternalUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.updateUser(
      this.readUpstreamTokens(req),
      params.id,
      body,
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  @Roles('ADMIN')
  @Patch('users/:id/roles')
  async replaceUserRoles(
    @Param(new ZodValidationPipe(internalUserIdParamsSchema)) params: InternalUserIdParamsDto,
    @Body(new ZodValidationPipe(replaceInternalUserRolesSchema)) body: ReplaceInternalUserRolesDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.replaceUserRoles(
      this.readUpstreamTokens(req),
      params.id,
      body,
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('roles')
  async listRoles(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listRoles(this.readUpstreamTokens(req));
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { items: result };
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('roles/:id')
  async getRole(
    @Param(new ZodValidationPipe(internalRoleIdParamsSchema)) params: InternalRoleIdParamsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.getRole(
      this.readUpstreamTokens(req),
      params.id,
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('permissions')
  async listPermissions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listPermissions(
      this.readUpstreamTokens(req),
    );
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { items: result };
  }

  /** Guarda las cookies upstream y devuelve la sesión propia del ERP. */
  private issueSession(res: Response, session: AuthSessionResult) {
    this.setUpstreamCookies(res, {
      accessToken: session.upstreamAccessToken,
      refreshToken: session.upstreamRefreshToken,
    });
    return {
      accessToken: session.accessToken,
      tokenType: session.tokenType,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  private readCookie(req: Request, name: string): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[name];
  }

  private readUpstreamTokens(req: Request): UpstreamTokens {
    return {
      accessToken: this.readCookie(req, UPSTREAM_ACCESS_COOKIE),
      refreshToken: this.readCookie(req, UPSTREAM_REFRESH_COOKIE),
    };
  }

  private reapplyRefreshedCookies(
    res: Response,
    refreshedTokens: RefreshedUpstreamTokens | undefined,
  ): void {
    if (refreshedTokens) this.setUpstreamCookies(res, refreshedTokens);
  }

  private setUpstreamCookies(res: Response, tokens: RefreshedUpstreamTokens): void {
    const secure = env.NODE_ENV === 'production';
    res.cookie(UPSTREAM_ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: UPSTREAM_ACCESS_COOKIE_PATH,
    });
    res.cookie(UPSTREAM_REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: UPSTREAM_COOKIE_PATH,
    });
  }

  private clearUpstreamCookies(res: Response): void {
    // Cada cookie se borra con SU path: el navegador sólo elimina la que coincide, así que
    // limpiar el token de acceso con la ruta del de refresco lo dejaría vivo en el navegador
    // después de cerrar sesión — un cierre que no cierra nada.
    res.clearCookie(UPSTREAM_ACCESS_COOKIE, { path: UPSTREAM_ACCESS_COOKIE_PATH });
    res.clearCookie(UPSTREAM_REFRESH_COOKIE, { path: UPSTREAM_COOKIE_PATH });
  }
}
