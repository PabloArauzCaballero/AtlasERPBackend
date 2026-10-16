import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthGatewayService } from './auth-gateway.service';
import {
  logoutSchema,
  merchantLoginSchema,
  merchantPasswordResetConfirmSchema,
  merchantPasswordResetRequestSchema,
  merchantReauthenticateSchema,
} from './auth-gateway.schemas';
import type {
  LogoutDto,
  MerchantLoginDto,
  MerchantPasswordResetConfirmDto,
  MerchantPasswordResetRequestDto,
  MerchantReauthenticateDto,
} from './auth-gateway.schemas';
import {
  UPSTREAM_REFRESH_COOKIE,
  clearUpstreamCookies,
  readCookie,
  readUpstreamTokens,
  reapplyRefreshedCookies,
  setUpstreamCookies,
} from './upstream-session-cookies';

@Controller('auth')
export class AuthMerchantController {
  constructor(private readonly service: AuthGatewayService) {}

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
    setUpstreamCookies(res, {
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
    const session = await this.service.merchantRefresh(readCookie(req, UPSTREAM_REFRESH_COOKIE));
    setUpstreamCookies(res, {
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

  /**
   * Reautenticación del comercio antes de cambiar su cuenta/QR de cobro (hallazgo ERP-03).
   *
   * Reenvía la contraseña a AtlasBackend con el token upstream de la sesión y devuelve la prueba
   * tal cual; el portal la manda en `x-reauth-token` al registrar el QR. La contraseña no se guarda
   * ni se registra aquí. Los errores conservan su código (`REAUTH_INVALID_PASSWORD`, `ACCOUNT_LOCKED`).
   */
  @Roles('merchant', 'MERCHANT_ADMIN', 'MERCHANT_OPERATIONS')
  @Post('merchant/reauthenticate')
  async merchantReauthenticate(
    @Body(new ZodValidationPipe(merchantReauthenticateSchema)) body: MerchantReauthenticateDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.merchantReauthenticate(
      readUpstreamTokens(req),
      body.password,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @Roles('MERCHANT_ADMIN')
  @Get('merchant/me')
  async merchantMe(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.merchantMe(readUpstreamTokens(req));
    reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
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
    clearUpstreamCookies(res);
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
      readCookie(req, UPSTREAM_REFRESH_COOKIE),
      body.allDevices,
    );
    clearUpstreamCookies(res);
    return result;
  }
}
