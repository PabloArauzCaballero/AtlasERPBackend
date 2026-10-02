import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { AtlasPartnerClient } from './atlas-partner.client';

/** Lo que AtlasBackend responde al asegurar la carpeta y el expediente del comercio. */
export interface MerchantFolder {
  partnerId: string | null;
  expedienteId: string | null;
  created: boolean;
  reason: string | null;
  /** Qué partes del expediente cargó Atlas en esta llamada (desde el 2026-10-02). */
  loaded?: string[];
  /** Lo que sigue faltando para enviar a revisión. Vacío = listo. */
  gaps?: string[];
  onboardingStatus?: string | null;
}

/** De qué cuenta es un contrato, y con qué número se nombra su documento en la carpeta. */
export interface ContractOwner {
  accountId: string;
  contractNumber: string;
}

/** La cuenta con todo lo que el expediente exige, tal como sale de la base. */
interface CuentaParaExpediente {
  legal_name: string;
  trade_name: string | null;
  tax_id: string | null;
  category: string | null;
  city: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  commercial_registry: string | null;
  legal_rep_full_name: string | null;
  legal_rep_document_type: string | null;
  legal_rep_document_number: string | null;
  power_of_attorney_file_id: string | null;
  bank_qr_file_id: string | null;
  bank_institution_code: string | null;
  bank_account_masked: string | null;
}

/** Un archivo del ERP (`erp_file`), para copiarlo a la carpeta del comercio. */
interface ArchivoDelErp {
  storage_public_id: string;
  mime_type: string | null;
  byte_size: number | null;
}

type DocumentoDelExpediente = 'power-of-attorney' | 'bank-qr';

/**
 * La carpeta y el expediente del comercio en Atlas (Operaciones › Archivos, con `qr/`,
 * `documentos/` y `otros/`; y la ficha que el comercio ve en «Mi empresa»).
 *
 * Hasta el 2026-09-26 esa carpeta sólo nacía cuando el comercio abría su ficha desde su portal.
 * Y hasta el 2026-10-02 el ERP le mandaba a AtlasBackend seis campos: el expediente nacía con los
 * cuatro requisitos vacíos («Falta 4 requisitos para enviar a revisión») y el comercio tenía que
 * volver a entregar lo que el vendedor ya había capturado. Pablo: «el usuario te lo pasa una vez y
 * esto debe estar listo y cargado». Ahora el ERP entrega TODO lo que la cuenta tiene —matrícula,
 * representante con su poder, la casa matriz como primera sucursal, el QR bancario— y, si no queda
 * nada por completar, el expediente se envía a revisión en el mismo paso.
 *
 * Tres llamadas y no una, por los archivos: el poder y el QR viven en el almacén de Atlas bajo el
 * prefijo del ERP (`erp-B2B_ACCOUNT-…`), y el expediente sólo acepta objetos bajo el prefijo del
 * comercio (`partner-<id>/`), que no existe hasta que la ficha existe. Así que: (1) asegurar la
 * ficha con lo que no lleva archivo; (2) copiar cada archivo que Atlas diga que falta a la carpeta
 * del comercio; (3) entregar lo que lleva archivo y pedir el envío. Las tres son idempotentes: lo
 * que ya está no se repite, y una llamada posterior (cada contrato subido vuelve a llamar aquí) no
 * vuelve a copiar nada.
 */
@Injectable()
export class MerchantFolderService {
  constructor(
    private readonly atlas: AtlasPartnerClient,
    private readonly logger: PinoLoggerService,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /** Asegura la carpeta y el expediente del comercio de una cuenta B2B. Idempotente. */
  async ensureForAccount(
    accountId: string,
    accessToken: string | undefined,
  ): Promise<MerchantFolder> {
    const [account] = await this.sequelize.query<CuentaParaExpediente>(
      `SELECT a.legal_name, a.trade_name, a.tax_id, a.category, a.city, a.address, c.email, c.phone,
              a.commercial_registry, a.legal_rep_full_name, a.legal_rep_document_type, a.legal_rep_document_number,
              a.power_of_attorney_file_id, a.bank_qr_file_id, a.bank_institution_code, a.bank_account_masked
         FROM atlas_sales.b2b_accounts a
         LEFT JOIN LATERAL (
           SELECT email, phone FROM atlas_sales.b2b_contacts
            WHERE account_id = a.id AND email IS NOT NULL AND btrim(email) <> ''
            ORDER BY is_primary DESC NULLS LAST
            LIMIT 1
         ) c ON TRUE
        WHERE a.id = :accountId`,
      { replacements: { accountId }, type: QueryTypes.SELECT },
    );
    if (!account) {
      return {
        partnerId: null,
        expedienteId: null,
        created: false,
        reason: 'CUENTA_NO_ENCONTRADA',
      };
    }

    const base = {
      erpAccountId: accountId,
      legalName: account.legal_name,
      tradeName: account.trade_name,
      taxId: account.tax_id,
      contactEmail: account.email,
      contactPhone: account.phone,
      commercialRegistry: account.commercial_registry,
      businessCategory: account.category,
      branch:
        account.address && account.city
          ? {
              branchCode: 'CASA-MATRIZ',
              name: 'Casa matriz',
              addressLine: account.address,
              city: account.city,
            }
          : null,
    };

    // (1) La ficha, la carpeta y lo que no lleva archivo.
    const primera = await this.atlas.forward<MerchantFolder>({
      method: 'POST',
      path: 'operations/erp-documents/merchant-expediente',
      accessToken,
      body: base,
    });
    if (!primera.partnerId || primera.reason) return primera;

    const faltan = new Set(primera.gaps ?? []);
    const necesitaRepresentante =
      faltan.has('legal_representative') || faltan.has('power_of_attorney');
    const necesitaQr = faltan.has('bank_qr');
    if (!necesitaRepresentante && !necesitaQr) return primera;

    // (2) Los archivos que Atlas dice que faltan, copiados a la carpeta del comercio.
    const poderKey =
      necesitaRepresentante && account.power_of_attorney_file_id
        ? await this.copiarAlExpediente(
            primera.partnerId,
            account.power_of_attorney_file_id,
            'power-of-attorney',
            accessToken,
          )
        : null;
    const qrKey =
      necesitaQr && account.bank_qr_file_id
        ? await this.copiarAlExpediente(
            primera.partnerId,
            account.bank_qr_file_id,
            'bank-qr',
            accessToken,
          )
        : null;

    // (3) Lo que lleva archivo, y el envío a revisión si ya no falta nada.
    const representante =
      necesitaRepresentante &&
      account.legal_rep_full_name &&
      account.legal_rep_document_type &&
      account.legal_rep_document_number
        ? {
            fullName: account.legal_rep_full_name,
            documentType: account.legal_rep_document_type,
            documentNumber: account.legal_rep_document_number,
            ...(poderKey ? { powerOfAttorneyKey: poderKey } : {}),
          }
        : null;
    const bankQr =
      necesitaQr && qrKey && account.bank_institution_code
        ? {
            qrKind: 'bank',
            storageKey: qrKey,
            bankInstitutionCode: account.bank_institution_code,
            ...(account.bank_account_masked
              ? { accountNumberMasked: account.bank_account_masked }
              : {}),
          }
        : null;
    if (!representante && !bankQr) return primera;

    return this.atlas.forward<MerchantFolder>({
      method: 'POST',
      path: 'operations/erp-documents/merchant-expediente',
      accessToken,
      body: { ...base, legalRepresentative: representante, bankQr, submitWhenComplete: true },
    });
  }

  /**
   * Copia un `erp_file` a la carpeta del comercio: pide el permiso de subida bajo `partner-<id>/`,
   * lee los bytes del almacén de Atlas con la sesión de quien opera y los sube a la URL firmada.
   * Devuelve la clave nueva, que es la que el expediente acepta. Un archivo borrado o del
   * proveedor retirado se salta: el requisito queda pendiente y Atlas lo dice en `gaps`.
   */
  private async copiarAlExpediente(
    partnerId: string,
    fileId: string,
    documentKind: DocumentoDelExpediente,
    accessToken: string | undefined,
  ): Promise<string | null> {
    const [archivo] = await this.sequelize.query<ArchivoDelErp>(
      `SELECT storage_public_id, mime_type, byte_size
         FROM atlas_accounting.erp_file
        WHERE id = :fileId AND status <> 'DELETED' AND storage_provider = 'ATLAS_MINIO'`,
      { replacements: { fileId }, type: QueryTypes.SELECT },
    );
    if (!archivo) {
      this.logger.warn(
        'El archivo del expediente no existe o se borró; el requisito queda pendiente.',
        {
          layer: 'service',
          module: 'partner-onboarding-gateway',
          action: 'copiarAlExpediente',
          documentKind,
          fileId,
        },
      );
      return null;
    }
    const { buffer, contentType } = await this.atlas.forwardBinary({
      method: 'GET',
      path: `operations/erp-documents/content?storageKey=${encodeURIComponent(archivo.storage_public_id)}`,
      accessToken,
    });
    const tipo = archivo.mime_type ?? contentType;
    const permiso = await this.atlas.forward<{
      uploadUrl: string;
      storageKey: string;
      requiredHeaders: Record<string, string>;
    }>({
      method: 'POST',
      path: `operations/erp-documents/merchant-expediente/${encodeURIComponent(partnerId)}/upload-url`,
      accessToken,
      body: { documentKind, contentType: tipo, sizeBytes: buffer.byteLength },
    });
    await this.atlas.putSigned({
      uploadUrl: permiso.uploadUrl,
      headers: permiso.requiredHeaders ?? {},
      body: buffer,
    });
    return permiso.storageKey;
  }

  /**
   * Igual que `ensureForAccount`, pero sin poder tumbar a quien llama: crear el onboarding o subir
   * un contrato no puede fallar porque Atlas no conteste. El resultado viaja en la respuesta, así
   * que el fallo queda a la vista.
   */
  async tryEnsureForAccount(
    accountId: string,
    accessToken: string | undefined,
  ): Promise<MerchantFolder> {
    try {
      return await this.ensureForAccount(accountId, accessToken);
    } catch (error) {
      this.logger.warn('No se pudo asegurar la carpeta del comercio en Atlas.', {
        layer: 'service',
        module: 'partner-onboarding-gateway',
        action: 'ensureMerchantFolder',
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { partnerId: null, expedienteId: null, created: false, reason: 'ATLAS_NO_RESPONDIO' };
    }
  }

  /**
   * La cuenta de un contrato, sea comercial (CRM, `b2b_contracts`) o contable (`contract_header`,
   * cuya contraparte es un socio de negocio que puede ser el de una cuenta B2B). `null` si el
   * contrato no es de ningún comercio —un proveedor, un préstamo—: su documento se guarda igual,
   * pero no tiene carpeta de comercio en la que aparecer.
   */
  async contractOwner(contractId: string): Promise<ContractOwner | null> {
    const [fila] = await this.sequelize.query<{ account_id: string; contract_number: string }>(
      `SELECT account_id, contract_number FROM atlas_sales.b2b_contracts WHERE id = :contractId
       UNION ALL
       SELECT a.id AS account_id, h.contract_no AS contract_number
         FROM atlas_accounting.contract_header h
         JOIN atlas_sales.b2b_accounts a ON a.business_partner_id = h.counterparty_bp_id
        WHERE h.id = :contractId
       LIMIT 1`,
      { replacements: { contractId }, type: QueryTypes.SELECT },
    );
    return fila ? { accountId: fila.account_id, contractNumber: fila.contract_number } : null;
  }
}
