import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { env } from '../../config/env';
import { AuthGatewayService } from './auth-gateway.service';
import {
  internalRoleIdParamsSchema,
  internalUserIdParamsSchema,
  loginSchema,
  logoutSchema,
  merchantLoginSchema,
  replaceInternalUserRolesSchema,
  updateInternalUserSchema,
} from './auth-gateway.schemas';
import type {
  InternalRoleIdParamsDto,
  InternalUserIdParamsDto,
  LoginDto,
  LogoutDto,
  MerchantLoginDto,
  ReplaceInternalUserRolesDto,
  UpdateInternalUserDto,
} from './auth-gateway.schemas';
import type { RefreshedUpstreamTokens, UpstreamTokens } from './auth-gateway.types';

const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';
const UPSTREAM_REFRESH_COOKIE = 'atlas_upstream_rt';
// Cookies del token de identidad upstream, restringidas a este controller: nunca deben viajar
// hacia otros módulos de este backend ni ser legibles por JS del navegador.
const UPSTREAM_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly service: AuthGatewayService) {}

  @Public()
  @Post('login')
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.login(body.email, body.password);
    this.setUpstreamCookies(res, { accessToken: session.upstreamAccessToken, refreshToken: session.upstreamRefreshToken });
    return { accessToken: session.accessToken, tokenType: session.tokenType, expiresIn: session.expiresIn, user: session.user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.refresh(this.readCookie(req, UPSTREAM_REFRESH_COOKIE));
    this.setUpstreamCookies(res, { accessToken: session.upstreamAccessToken, refreshToken: session.upstreamRefreshToken });
    return { accessToken: session.accessToken, tokenType: session.tokenType, expiresIn: session.expiresIn, user: session.user };
  }

  @Public()
  @Post('logout')
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.logout(this.readCookie(req, UPSTREAM_REFRESH_COOKIE), body.allDevices);
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
    this.setUpstreamCookies(res, { accessToken: session.upstreamAccessToken, refreshToken: session.upstreamRefreshToken });
    return { accessToken: session.accessToken, tokenType: session.tokenType, expiresIn: session.expiresIn, user: session.user };
  }

  @Public()
  @Post('merchant/refresh')
  async merchantRefresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.merchantRefresh(this.readCookie(req, UPSTREAM_REFRESH_COOKIE));
    this.setUpstreamCookies(res, { accessToken: session.upstreamAccessToken, refreshToken: session.upstreamRefreshToken });
    return { accessToken: session.accessToken, tokenType: session.tokenType, expiresIn: session.expiresIn, user: session.user };
  }

  @Public()
  @Post('merchant/logout')
  async merchantLogout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.merchantLogout(this.readCookie(req, UPSTREAM_REFRESH_COOKIE), body.allDevices);
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
    const { result, refreshedTokens } = await this.service.getUser(this.readUpstreamTokens(req), params.id);
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
    const { result, refreshedTokens } = await this.service.updateUser(this.readUpstreamTokens(req), params.id, body);
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
    const { result, refreshedTokens } = await this.service.replaceUserRoles(this.readUpstreamTokens(req), params.id, body);
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
    const { result, refreshedTokens } = await this.service.getRole(this.readUpstreamTokens(req), params.id);
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('permissions')
  async listPermissions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listPermissions(this.readUpstreamTokens(req));
    this.reapplyRefreshedCookies(res, refreshedTokens);
    return { items: result };
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

  private reapplyRefreshedCookies(res: Response, refreshedTokens: RefreshedUpstreamTokens | undefined): void {
    if (refreshedTokens) this.setUpstreamCookies(res, refreshedTokens);
  }

  private setUpstreamCookies(res: Response, tokens: RefreshedUpstreamTokens): void {
    const secure = env.NODE_ENV === 'production';
    res.cookie(UPSTREAM_ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: UPSTREAM_COOKIE_PATH,
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
    res.clearCookie(UPSTREAM_ACCESS_COOKIE, { path: UPSTREAM_COOKIE_PATH });
    res.clearCookie(UPSTREAM_REFRESH_COOKIE, { path: UPSTREAM_COOKIE_PATH });
  }
}
