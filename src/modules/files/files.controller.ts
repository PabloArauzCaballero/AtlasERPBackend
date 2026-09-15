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
import { ErpFilesService } from './erp-files.service';
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

@Roles(
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
  'merchant_admin',
)
@Controller('files')
export class FilesController {
  constructor(private readonly service: ErpFilesService) {}

  /*
   * El permiso y la verificación los da AtlasBackend con el token de identidad de la persona (la
   * cookie `atlas_upstream_at`), igual que el resto de lo que cruza al otro lado.
   */
  @Post('upload-signature')
  signUpload(
    @Req() req: Request,
    @Body(new ZodValidationPipe(uploadSignatureSchema)) body: UploadSignatureDto,
  ) {
    return this.service.signUpload(body, this.token(req));
  }

  @Post()
  register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(registerFileSchema)) body: RegisterFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.register(body, user, this.token(req));
  }

  /** Los bytes, con la sesión: un `<a href>` a una URL pública era justo lo que se retiró. */
  @Get(':id/content')
  @Header('Cache-Control', 'private, max-age=60')
  async content(
    @Req() req: Request,
    @Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.service.content(params.id, this.token(req));
    res.setHeader('Content-Type', archivo.contentType);
    return new StreamableFile(archivo.buffer);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listFilesQuerySchema)) query: ListFilesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto) {
    return this.service.get(params.id);
  }

  @Delete(':id')
  remove(@Param(new ZodValidationPipe(fileIdParamsSchema)) params: FileIdParamsDto) {
    return this.service.remove(params.id);
  }

  private token(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[UPSTREAM_ACCESS_COOKIE];
  }
}
