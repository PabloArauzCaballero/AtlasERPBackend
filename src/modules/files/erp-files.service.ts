import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { WhereOptions } from 'sequelize';
import { ErpFileModel } from '../../database/models';
import { AuthUser } from '../../common/types/auth-context.types';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { AtlasPartnerClient } from '../partner-onboarding-gateway/atlas-partner.client';
import { ListFilesQueryDto, RegisterFileDto, UploadSignatureDto } from './files.schemas';

/** El permiso de subida que emite AtlasBackend. La forma es la de su `UploadTicket`. */
export interface UploadTicket {
  storageKey: string;
  uploadUrl: string;
  method: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/** Cómo se llama el proveedor en `erp_file.storage_provider` desde que los archivos viven en Atlas. */
export const ATLAS_STORAGE_PROVIDER = 'ATLAS_MINIO';

/**
 * Los adjuntos del ERP («Documentos KYB / respaldo», documentos de la cuenta, del plan contable).
 *
 * Hasta el 2026-09-14 iban a Cloudinary, que no estaba configurado en ningún entorno (el botón
 * fallaba con 503) y que, de haber funcionado, habría dejado un documento KYB en una URL pública
 * con una firma que sólo cubría la carpeta: sin tipo, sin tamaño, sin hash y sin sesión para leerlo.
 *
 * Ahora van al almacén de evidencia de Atlas con el mismo contrato que el carnet de un cliente:
 * AtlasBackend emite el permiso bajo `<tenant>/erp-<dueño>/`, el navegador sube directo, el objeto
 * se VERIFICA antes de registrarse y se lee por bytes con la sesión (`GET /files/:id/content`).
 */
@Injectable()
export class ErpFilesService {
  constructor(
    private readonly atlas: AtlasPartnerClient,
    private readonly logger: PinoLoggerService,
    @InjectModel(ErpFileModel) private readonly fileModel: typeof ErpFileModel,
  ) {}

  signUpload(input: UploadSignatureDto, accessToken: string | undefined): Promise<UploadTicket> {
    this.logger.info('Emitiendo permiso de subida de archivo.', {
      layer: 'service',
      module: 'files',
      action: 'signUpload',
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    });
    return this.atlas.forward<UploadTicket>({
      method: 'POST',
      path: 'operations/erp-documents/upload-url',
      accessToken,
      body: {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        documentKind: 'adjunto',
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      },
    });
  }

  /** Registra el archivo DESPUÉS de que AtlasBackend haya comprobado que existe y es lo que dice ser. */
  async register(
    input: RegisterFileDto,
    user: AuthUser,
    accessToken: string | undefined,
  ): Promise<ErpFileModel> {
    const verified = await this.atlas.forward<{
      sizeBytes: number;
      sha256: string;
      contentType: string | null;
    }>({
      method: 'POST',
      path: 'operations/erp-documents/verify',
      accessToken,
      body: {
        storageKey: input.storageKey,
        sha256: input.sha256,
        contentType: input.contentType,
        sizeBytes: input.byteSize,
      },
    });
    this.logger.info('Registrando archivo ERP.', {
      layer: 'service',
      module: 'files',
      action: 'register',
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      storageKey: input.storageKey,
    });
    return this.fileModel.create({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileName: input.fileName,
      mimeType: input.contentType,
      byteSize: verified.sizeBytes ?? input.byteSize,
      storageProvider: ATLAS_STORAGE_PROVIDER,
      storagePublicId: input.storageKey,
      // No hay URL pública a propósito: los bytes se sirven por `GET /files/:id/content` con sesión.
      secureUrl: `atlas-minio://${input.storageKey}`,
      resourceType: input.contentType === 'application/pdf' ? 'raw' : 'image',
      sha256: (verified.sha256 ?? input.sha256).toLowerCase(),
      uploadedBy: user?.sub ?? null,
    });
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

  /** Los bytes, con la sesión. Un archivo registrado con el proveedor viejo ya no se puede servir. */
  async content(
    id: string,
    accessToken: string | undefined,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const file = await this.get(id);
    if (file.storageProvider !== ATLAS_STORAGE_PROVIDER) {
      throw new NotFoundException({
        code: 'ERP_FILE_PROVIDER_RETIRED',
        message:
          'Este archivo se registró con el proveedor anterior (Cloudinary), que ya no se usa; vuelve a subirlo.',
      });
    }
    return this.atlas.forwardBinary({
      method: 'GET',
      path: `operations/erp-documents/content?storageKey=${encodeURIComponent(file.storagePublicId)}`,
      accessToken,
    });
  }

  /**
   * Baja lógica. El objeto se conserva en el almacén: es evidencia de lo que respaldó una decisión,
   * y AtlasBackend no expone borrado de documentos del ERP (el de privacidad es por sujeto).
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const file = await this.get(id);
    await file.update({ status: 'DELETED' });
    return { deleted: true };
  }
}
