import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
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

  @Post('upload-signature')
  signUpload(@Body(new ZodValidationPipe(uploadSignatureSchema)) body: UploadSignatureDto) {
    return this.service.signUpload(body);
  }

  @Post()
  register(
    @Body(new ZodValidationPipe(registerFileSchema)) body: RegisterFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.register(body, user);
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
}
