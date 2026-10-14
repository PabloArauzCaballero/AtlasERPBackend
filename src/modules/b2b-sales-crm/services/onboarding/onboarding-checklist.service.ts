import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../../common/types/auth-context.types';
import { ChecklistStatus } from '../../b2b-sales-crm.enums';
import type {
  AttachChecklistEvidenceDto,
  ChecklistEvidenceUploadUrlDto,
  CompleteChecklistItemDto,
} from '../../b2b-sales-crm.dtos';
import { B2BSalesCrmRepository } from '../../repositories/b2b-sales-crm.repository';
import { MerchantFolderService } from '../../../partner-onboarding-gateway/merchant-folder.service';
import { AtlasPartnerClient } from '../../../partner-onboarding-gateway/atlas-partner.client';
import { OnboardingCaseQueryService } from './onboarding-case-query.service';
import { claseDelRequisito, requiresEvidence } from './onboarding-checklist.rules';
import { OnboardingUseCase } from './onboarding-use-case.base';

/** Los requisitos del alta y el archivo que los respalda. */
@Injectable()
export class OnboardingChecklistService extends OnboardingUseCase {
  constructor(
    repository: B2BSalesCrmRepository,
    logger: PinoLoggerService,
    private readonly partnerClient: AtlasPartnerClient,
    private readonly merchantFolder: MerchantFolderService,
    private readonly caseQuery: OnboardingCaseQueryService,
  ) {
    super(repository, logger);
  }

  async completeChecklistItem(
    onboardingCaseId: string,
    input: CompleteChecklistItemDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    this.announce('completeChecklistItem');
    const item = await this.findChecklistItem(onboardingCaseId, input.checklistItemId);

    /*
     * Un requisito documental no se completa con un desplegable.
     *
     * Hasta el 2026-09-14 «NIT vigente» o «Poder del representante» pasaban a COMPLETED sin que
     * existiera ningún archivo: la pantalla prometía requisitos legales y guardaba una casilla.
     * Eximirlo (WAIVED) sigue siendo posible y queda escrito como tal; completarlo exige el archivo.
     */
    if (
      input.status === ChecklistStatus.COMPLETED &&
      requiresEvidence(item.itemType) &&
      !item.evidenceStorageKey
    ) {
      throw new ConflictException(
        `REQUISITO_SIN_EVIDENCIA: el requisito «${item.description}» (${item.itemType}) exige un archivo antes de marcarse completado; adjúntalo o exímelo.`,
      );
    }

    await item.update({
      status: input.status,
      completedByUserId: await this.resolveInternalUserId(user),
    });
    return this.caseQuery.getOnboardingCase(onboardingCaseId);
  }

  /**
   * Permiso de subida para el archivo de un requisito. Lo emite AtlasBackend: la ruta del objeto
   * la impone él (`<tenant>/erp-<dueño>-<id>/<clase>/…`) y firma tipo y tamaño.
   *
   * El dueño en el almacén es la CUENTA del caso, no el caso. AtlasBackend sólo sabe atar a un
   * comercio la cuenta B2B (`partner_profiles.erp_account_id`); con el caso como dueño, el NIT o el
   * poder que se subían aquí quedaban en el almacén y no aparecían en Operaciones › Archivos
   * (medido en TEST el 2026-09-28: cinco objetos `erp-onboarding_case-…`, cero en ningún
   * expediente). Antes se asegura la carpeta, como con el contrato: un caso abierto antes de
   * existir la carpeta, o sin NIT en su día, no la tenía. La fila sigue siendo del requisito.
   */
  async createChecklistEvidenceUploadUrl(
    onboardingCaseId: string,
    checklistItemId: string,
    input: ChecklistEvidenceUploadUrlDto,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const item = await this.findChecklistItem(onboardingCaseId, checklistItemId);
    const caso = await this.repository.onboardingCases.findByPk(onboardingCaseId);
    const accountId = caso?.accountId ?? null;
    if (accountId) await this.merchantFolder.tryEnsureForAccount(accountId, accessToken);
    return this.partnerClient.forward<Record<string, unknown>>({
      method: 'POST',
      path: 'operations/erp-documents/upload-url',
      accessToken,
      body: {
        ownerType: accountId ? 'b2b_account' : 'ONBOARDING_CASE',
        ownerId: accountId ?? onboardingCaseId,
        documentKind: claseDelRequisito(item.description, item.itemType),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      },
    });
  }

  /**
   * Registra el archivo ya subido como evidencia del requisito.
   *
   * AtlasBackend lo VERIFICA primero (prefijo de propiedad, existencia, hash, tamaño y tipo real):
   * registrar lo que el navegador declara sin mirarlo dejaría un requisito «respaldado» por un
   * objeto que no existe o que no es lo que dice ser.
   */
  async attachChecklistEvidence(
    onboardingCaseId: string,
    checklistItemId: string,
    input: AttachChecklistEvidenceDto,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    this.announce('attachChecklistEvidence');
    const item = await this.findChecklistItem(onboardingCaseId, checklistItemId);
    const verified = await this.partnerClient.forward<{
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
        sizeBytes: input.sizeBytes,
      },
    });
    await item.update({
      evidenceStorageKey: input.storageKey,
      evidenceContentType: input.contentType,
      evidenceSha256: verified.sha256 ?? input.sha256,
      evidenceSizeBytes: verified.sizeBytes ?? input.sizeBytes,
      evidenceUploadedAt: new Date(),
    });
    return this.caseQuery.getOnboardingCase(onboardingCaseId);
  }

  /** Los bytes del archivo del requisito, para verlo. Pasan por AtlasBackend con la sesión: nunca por URL pública. */
  async readChecklistEvidence(
    onboardingCaseId: string,
    checklistItemId: string,
    accessToken: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const item = await this.findChecklistItem(onboardingCaseId, checklistItemId);
    if (!item.evidenceStorageKey) {
      throw new NotFoundException('Este requisito no tiene archivo adjunto.');
    }
    return this.partnerClient.forwardBinary({
      method: 'GET',
      path: `operations/erp-documents/content?storageKey=${encodeURIComponent(item.evidenceStorageKey)}`,
      accessToken,
    });
  }

  private async findChecklistItem(onboardingCaseId: string, checklistItemId: string) {
    const item = await this.repository.checklistItems.findOne({
      where: { id: checklistItemId, onboardingCaseId },
    });
    if (!item) {
      throw new NotFoundException('Ítem de checklist no encontrado.');
    }
    return item;
  }

  /**
   * Traduce el principal del token al usuario interno DE ESTE backend.
   *
   * Atlas parte la identidad a proposito: quien es la persona y como inicia sesion vive en
   * AtlasBackend, que emite identificadores opacos (bigints: `"1"`, `"27"`); a que puede tocar
   * aqui responde `atlas_sales.internal_users`, cuya clave es un `uuid`. `completed_by_user_id`
   * apunta a esa tabla.
   *
   * Antes se guardaba `user.sub` directamente y Postgres rechazaba `"1"` como uuid: completar un
   * requisito moria en un 500 «Ocurrio un error al consultar o modificar la base de datos.» y, sin
   * poder completarlo, la activacion quedaba bloqueada para siempre por su propio control. Es el
   * mismo error que ya se corrigio en la revision manual del motor: dos identidades distintas para
   * la misma persona.
   *
   * Se resuelve por correo, que es lo unico que ambas bases comparten. Si la persona autentica
   * contra AtlasBackend y aun no tiene reflejo aqui, se crea: es exactamente lo que ya hace el
   * canal del comercio con `merchant_users.user_id`, y evita que un analista recien dado de alta
   * arriba se quede sin poder trabajar abajo.
   */
  private async resolveInternalUserId(user: AuthUser): Promise<string | null> {
    const email = user.email?.trim().toLowerCase();
    if (!email) return null;

    const existing = await this.repository.internalUsers.findOne({ where: { email } });
    if (existing) return existing.id;

    const created = await this.repository.internalUsers.create({
      email,
      fullName: email,
      roleCode: user.roleCode ?? user.role ?? 'ADMIN',
      isActive: true,
    });
    return created.id;
  }
}
