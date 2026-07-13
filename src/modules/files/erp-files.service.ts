import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WhereOptions } from 'sequelize';
import { ErpFileModel } from '../../database/models';
import { AuthUser } from '../../common/types/auth-context.types';
import { env } from '../../config/env';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { CloudinaryService, UploadSignature } from './cloudinary.service';
import {
  ListFilesQueryDto,
  RegisterFileDto,
  UploadSignatureDto,
} from './files.schemas';

@Injectable()
export class ErpFilesService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly logger: PinoLoggerService,
    @InjectModel(ErpFileModel) private readonly fileModel: typeof ErpFileModel,
  ) {}

  /** Emite la firma para que el navegador suba el archivo directo a Cloudinary. */
  signUpload(input: UploadSignatureDto): UploadSignature {
    const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${input.ownerType.toLowerCase()}/${input.ownerId}`;
    this.logger.info('Emitiendo firma de subida de archivo.', {
      layer: 'service',
      module: 'files',
      action: 'signUpload',
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    });
    return this.cloudinary.buildUploadSignature(folder);
  }

  /** Persiste los metadatos del archivo ya subido a Cloudinary. */
  register(input: RegisterFileDto, user: AuthUser): Promise<ErpFileModel> {
    this.logger.info('Registrando archivo ERP.', {
      layer: 'service',
      module: 'files',
      action: 'register',
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      storagePublicId: input.storagePublicId,
    });
    return this.fileModel.create({ ...input, uploadedBy: user?.sub ?? null });
  }

  list(query: ListFilesQueryDto): Promise<ErpFileModel[]> {
    return this.fileModel.findAll({
      where: {
        ownerType: query.ownerType,
        ownerId: query.ownerId,
        status: 'ACTIVE',
      } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
  }

  async get(id: string): Promise<ErpFileModel> {
    const file = await this.fileModel.findByPk(id);
    if (!file || file.status === 'DELETED') {
      throw new NotFoundException({
        code: 'ERP_FILE_NOT_FOUND',
        message: 'El archivo informado no existe.',
      });
    }
    return file;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const file = await this.get(id);
    try {
      await this.cloudinary.destroy(file.storagePublicId, file.resourceType ?? 'image');
    } catch (error) {
      this.logger.warn('No se pudo eliminar el binario en Cloudinary; se marca el registro igual.', {
        layer: 'service',
        module: 'files',
        action: 'remove',
        erpFileId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await file.update({ status: 'DELETED' });
    return { deleted: true };
  }
}
