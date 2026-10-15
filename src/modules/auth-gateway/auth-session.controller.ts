import { AnyAuthenticated } from '../../common/decorators/any-authenticated.decorator';
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthGatewayService } from './auth-gateway.service';
import { loginPinSchema, loginSchema, logoutSchema } from './auth-gateway.schemas';
import type { LoginDto, LoginPinDto, LogoutDto } from './auth-gateway.schemas';
import { isPinChallenge } from './auth-gateway.types';
import {
  UPSTREAM_REFRESH_COOKIE,
  clearUpstreamCookies,
  issueSession,
  readCookie,
  readUpstreamTokens,
  reapplyRefreshedCookies,
  setUpstreamCookies,
} from './upstream-session-cookies';

@Controller('auth')
export class AuthSessionController {
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
    return issueSession(res, outcome);
  }

  @Public()
  @Post('login/pin')
  async loginPin(
    @Body(new ZodValidationPipe(loginPinSchema)) body: LoginPinDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return issueSession(res, await this.service.loginPin(body.challengeToken, body.pin));
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.service.refresh(readCookie(req, UPSTREAM_REFRESH_COOKIE));
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
  @Post('logout')
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.logout(
      readCookie(req, UPSTREAM_REFRESH_COOKIE),
      body.allDevices,
    );
    clearUpstreamCookies(res);
    return result;
  }

  @AnyAuthenticated()
  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.me(readUpstreamTokens(req));
    reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }
}
