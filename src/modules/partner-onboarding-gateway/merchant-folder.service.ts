import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Sequelize } from 'sequelize';
import { PinoLoggerService } from '../../common/logger/pino-logger.service';
import { AtlasPartnerClient } from './atlas-partner.client';

/** Lo que AtlasBackend responde al asegurar la carpeta del comercio. */
export interface MerchantFolder {
  partnerId: string | null;
  expedienteId: string | null;
  created: boolean;
  reason: string | null;
}

/** De qué cuenta es un contrato, y con qué número se nombra su documento en la carpeta. */
export interface ContractOwner {
  accountId: string;
  contractNumber: string;
}

/**
 * La carpeta del comercio en Atlas (Operaciones › Archivos, con `qr/`, `documentos/` y `otros/`).
 *
 * Hasta el 2026-09-26 esa carpeta sólo nacía cuando el comercio abría su ficha desde su portal: un
 * onboarding creado en el ERP no tenía carpeta, y el contrato firmado que el ERP guardaba quedaba en
 * el almacén sin aparecer en ningún sitio. Pablo pidió que exista desde que se crea el onboarding,
 * y que el ERP abra la ficha del comercio si falta. Esto le manda a AtlasBackend lo que sabe de la
 * cuenta —razón social, NIT, correo del contacto principal— y AtlasBackend busca, abre o enlaza.
 */
@Injectable()
export class MerchantFolderService {
  constructor(
    private readonly atlas: AtlasPartnerClient,
    private readonly logger: PinoLoggerService,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /** Asegura la carpeta del comercio de una cuenta B2B. Idempotente. */
  async ensureForAccount(
    accountId: string,
    accessToken: string | undefined,
  ): Promise<MerchantFolder> {
    const [account] = await this.sequelize.query<{
      legal_name: string;
      trade_name: string | null;
      tax_id: string | null;
      email: string | null;
      phone: string | null;
    }>(
      `SELECT a.legal_name, a.trade_name, a.tax_id, c.email, c.phone
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
    if (!account)
      return {
        partnerId: null,
        expedienteId: null,
        created: false,
        reason: 'CUENTA_NO_ENCONTRADA',
      };
    return this.atlas.forward<MerchantFolder>({
      method: 'POST',
      path: 'operations/erp-documents/merchant-expediente',
      accessToken,
      body: {
        erpAccountId: accountId,
        legalName: account.legal_name,
        tradeName: account.trade_name,
        taxId: account.tax_id,
        contactEmail: account.email,
        contactPhone: account.phone,
      },
    });
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
