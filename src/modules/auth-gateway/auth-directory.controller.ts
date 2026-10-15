import { Body, Controller, Get, Param, Patch, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthGatewayService } from './auth-gateway.service';
import {
  internalRoleIdParamsSchema,
  internalUserIdParamsSchema,
  replaceInternalUserRolesSchema,
  updateInternalUserSchema,
} from './auth-gateway.schemas';
import type {
  InternalRoleIdParamsDto,
  InternalUserIdParamsDto,
  ReplaceInternalUserRolesDto,
  UpdateInternalUserDto,
} from './auth-gateway.schemas';
import { readUpstreamTokens, reapplyRefreshedCookies } from './upstream-session-cookies';

@Controller('auth')
export class AuthDirectoryController {
  constructor(private readonly service: AuthGatewayService) {}

  @Roles('ADMIN', 'AUDITOR')
  @Get('users')
  async listUsers(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listUsers(readUpstreamTokens(req));
    reapplyRefreshedCookies(res, refreshedTokens);
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
      readUpstreamTokens(req),
      params.id,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
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
      readUpstreamTokens(req),
      params.id,
      body,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
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
      readUpstreamTokens(req),
      params.id,
      body,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
    return { user: result };
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('roles')
  async listRoles(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listRoles(readUpstreamTokens(req));
    reapplyRefreshedCookies(res, refreshedTokens);
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
      readUpstreamTokens(req),
      params.id,
    );
    reapplyRefreshedCookies(res, refreshedTokens);
    return result;
  }

  @Roles('ADMIN', 'AUDITOR')
  @Get('permissions')
  async listPermissions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { result, refreshedTokens } = await this.service.listPermissions(readUpstreamTokens(req));
    reapplyRefreshedCookies(res, refreshedTokens);
    return { items: result };
  }
}
