import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../common/types/auth-context.types';
import { PortalScopeService } from '../portal/portal.scope.service';
import { ErpFilesService, type FileAccountScope } from './erp-files.service';
import {
  FileIdParamsDto,
  ListFilesQueryDto,
  RegisterFileDto,
  UploadSignatureDto,
  fileIdParamsSchema,
  listFilesQuerySchema,
  registerFileSchema,
  uploadSignatureSchema,
} from './files.schemas';

/** La cookie con el token de identidad de Atlas; mismo nombre que en la pasarela de comercios. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/** Los roles de `/files` que operan adjuntos de cualquier dueño: todos menos el del comercio. */
const FILE_STAFF_ROLES = [
  'admin',
  'accountant',
  'cfo',
  'treasury',
  'finance',
  'operations',
  'legal',
  'collections',
  'commercial_manager',
  'commercial_executive',
] as const;

@Roles(...FILE_STAFF_ROLES, 'merchant_admin')
@Controller('files')
export class FilesController {
  constructor(
    private readonly service: ErpFilesService,
    private readonly portalScope: PortalScopeService,
  ) {}

  /*
   * El permiso y la verificación los da AtlasBackend con el token de identidad de la persona (la
   * cookie `atlas_upstream_at`), igual que el resto de lo que cruza al otro lado.
   */
  @Post('upload-signature')
  async signUpload(
    @Req() req: Request,
    @Body(new ZodValidationPipe(uploadSignatureSchema)) body: UploadSignatureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.signUpload(body, this.token(req), await this.scope(user));
  }

  @Post()
  async register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(registerFileSchema)) body: RegisterFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.register(body, user, this.token(req), await this.scope(user));
  }

  /** Los bytes, con la sesión: un `<a href>` a una URL pública era justo lo que se retiró. */
  @Get(':id/content')
  @Header('Cache-Control', 'private, max-age=60')
  async content(
    @Req() req: Request,
    @Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const archivo = await this.service.content(params.id, this.token(req), await this.scope(user));
    res.setHeader('Content-Type', archivo.contentType);
    return new StreamableFile(archivo.buffer);
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listFilesQuerySchema)) query: ListFilesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.list(query, await this.scope(user));
  }

  @Get(':id')
  async get(
    @Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.get(params.id, await this.scope(user));
  }

  @Delete(':id')
  async remove(
    @Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(params.id, await this.scope(user));
  }

  /** `null` para staff; las cuentas del comercio para `merchant_admin` (403 sin membresía activa). */
  private scope(user: AuthUser): Promise<FileAccountScope> {
    return this.portalScope.restrictToOwnAccounts(user, FILE_STAFF_ROLES);
  }

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }
}
