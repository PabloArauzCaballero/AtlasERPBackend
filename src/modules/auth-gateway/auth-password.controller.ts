import { AnyAuthenticated } from '../../common/decorators/any-authenticated.decorator';
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthGatewayService } from './auth-gateway.service';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  passwordChangeConfirmSchema,
  passwordChangeRequestSchema,
} from './auth-gateway.schemas';
import type {
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  PasswordChangeConfirmDto,
  PasswordChangeRequestDto,
} from './auth-gateway.schemas';
import {
  clearUpstreamCookies,
  readUpstreamTokens,
  reapplyRefreshedCookies,
} from './upstream-session-cookies';

@Controller('auth')
export class AuthPasswordController {
  constructor(private readonly service: AuthGatewayService) {}

  /**
   * Cambio de contraseña del usuario autenticado, en dos pasos contra AtlasBackend.
   *
   * No lleva `@Roles`: cualquier usuario con sesión puede cambiar SU propia contraseña, y quién es
   * lo decide el token upstream de la cookie, no el cuerpo.
   */
  @AnyAuthenticated()
  @Post('password/change/request')
  async requestPasswordChange(
    @Body(new ZodValidationPipe(passwordChangeRequestSchema)) body: PasswordChangeRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result, refreshedTokens } = await this.service.requestPasswordChange(
      readUpstreamTokens(req),
      body.currentPassword,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @AnyAuthenticated()
  @Post('password/change/confirm')
  async confirmPasswordChange(
    @Body(new ZodValidationPipe(passwordChangeConfirmSchema)) body: PasswordChangeConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { result } = await this.service.confirmPasswordChange(readUpstreamTokens(req), body);
    // AtlasBackend revoca TODA sesión del actor al cambiar la contraseña, incluida ésta. Dejar las
    // cookies upstream puestas sólo serviría para que la siguiente llamada fallara con un 401
    // inexplicable: se limpian aquí y el front manda al login.
    clearUpstreamCookies(res);
    return result;
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
    clearUpstreamCookies(res);
    return result;
  }
}
