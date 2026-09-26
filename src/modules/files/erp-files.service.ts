import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
/**
 * Alcance del llamador sobre los adjuntos: `null` = staff (cualquier dueño); una lista = las
 * cuentas de comercio del usuario partner, que sólo alcanza los adjuntos de SUS cuentas
 * (`B2B_ACCOUNT`). Los demás tipos de dueño (asientos, cuentas GL, partners contables…) son
 * contabilidad interna y un comercio no los ve nunca.
 */
export type FileAccountScope = readonly string[] | null;

/** Tipo de dueño que un comercio puede alcanzar: su propia cuenta. */
const MERCHANT_OWNER_TYPE = 'B2B_ACCOUNT';

@Injectable()
export class ErpFilesService {
  constructor(
    private readonly atlas: AtlasPartnerClient,
    private readonly logger: PinoLoggerService,
    @InjectModel(ErpFileModel) private readonly fileModel: typeof ErpFileModel,
  ) {}

  signUpload(
    input: UploadSignatureDto,
    accessToken: string | undefined,
    scope: FileAccountScope = null,
  ): Promise<UploadTicket> {
    this.assertOwnerInScope(input.ownerType, input.ownerId, scope);
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
    scope: FileAccountScope = null,
  ): Promise<ErpFileModel> {
    this.assertOwnerInScope(input.ownerType, input.ownerId, scope);
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

  list(query: ListFilesQueryDto, scope: FileAccountScope = null): Promise<ErpFileModel[]> {
    this.assertOwnerInScope(query.ownerType, query.ownerId, scope);
    return this.fileModel.findAll({
      where: {
        ownerType: query.ownerType,
        ownerId: query.ownerId,
        status: 'ACTIVE',
      } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
  }

  async get(id: string, scope: FileAccountScope = null): Promise<ErpFileModel> {
    const file = await this.fileModel.findByPk(id);
    if (!file || file.status === 'DELETED') {
      throw new NotFoundException({
        code: 'ERP_FILE_NOT_FOUND',
        message: 'El archivo informado no existe.',
      });
    }
    this.assertOwnerInScope(file.ownerType, file.ownerId, scope);
    return file;
  }

  /*
   * `/files` acepta `merchant_admin` a nivel de clase y ninguna ruta miraba de quién era el
   * archivo: un comercio listaba, leía, descargaba y daba de baja los documentos KYB de otro con
   * sólo conocer su id o el de la cuenta (P-13). Se comprueba ANTES de hablar con AtlasBackend.
   */
  private assertOwnerInScope(ownerType: string, ownerId: string, scope: FileAccountScope): void {
    if (scope === null) return;
    if (ownerType === MERCHANT_OWNER_TYPE && scope.includes(ownerId)) return;
    throw new ForbiddenException({
      code: 'ERP_FILE_FORBIDDEN',
      message: 'No tienes permiso sobre los archivos de este dueño.',
    });
  }

  /** Los bytes, con la sesión. Un archivo registrado con el proveedor viejo ya no se puede servir. */
  async content(
    id: string,
    accessToken: string | undefined,
    scope: FileAccountScope = null,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const file = await this.get(id, scope);
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
  async remove(id: string, scope: FileAccountScope = null): Promise<{ deleted: boolean }> {
    const file = await this.get(id, scope);
    await file.update({ status: 'DELETED' });
    return { deleted: true };
  }
}
