/**
 * Identidad común cuota del ERP <-> cuota de Core (P-14 · P-08, tabla §2.1 del plan).
 *
 * Core es la fuente de la cuota y de sus pagos; el ERP, de la cobertura, la CxP y la recuperación.
 * Las dos cuotas se relacionan por un mapeo EXPLÍCITO (`atlas_sales.core_installment_links`) que se
 * escribe al registrar la compra BNPL con `coreLoanRef`. Con él:
 *
 *  - un `payment.*` de Core se traduce a la cuota del ERP (consumidor `core-payments`), y
 *  - los eventos del ERP sobre esa cuota (`b2b.coverage.settled`, `b2b.recovery.*`) llevan `coreRef`
 *    para que Core los ate a SU cuota sin adivinar.
 *
 * Sin mapeo nada se infiere por importe, fecha o documento: el evento de Core queda como excepción
 * de integración y el del ERP sale con `coreRef: null`.
 */
import { ConflictException } from '@nestjs/common';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';

export interface CoreRef {
  tenantId: string;
  loanId: string;
  installmentId: string;
  partnerProfileId: string | null;
}

export async function linkCoreInstallment(
  sequelize: Sequelize,
  link: {
    erpPurchaseId: string;
    erpInstallmentId: string;
    coreTenantId: string;
    coreLoanId: string;
    coreInstallmentId: string;
    corePartnerProfileId: string | null;
  },
  transaction: Transaction,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO atlas_sales.core_installment_links
         (erp_purchase_id, erp_installment_id, core_tenant_id, core_loan_id, core_installment_id,
          core_partner_profile_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      {
        bind: [
          link.erpPurchaseId,
          link.erpInstallmentId,
          link.coreTenantId,
          link.coreLoanId,
          link.coreInstallmentId,
          link.corePartnerProfileId,
        ],
        transaction,
      },
    );
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new ConflictException({
        code: 'CORE_INSTALLMENT_ALREADY_LINKED',
        message: 'Esa cuota de Core ya está ligada a otra cuota del ERP.',
      });
    }
    throw error;
  }
}

/** La cuota de Core de una cuota del ERP, o `null` si no está mapeada. */
export async function findCoreRef(
  sequelize: Sequelize,
  erpInstallmentId: string,
  transaction: Transaction,
): Promise<CoreRef | null> {
  const rows = await sequelize.query<{
    core_tenant_id: string;
    core_loan_id: string;
    core_installment_id: string;
    core_partner_profile_id: string | null;
  }>(
    `SELECT core_tenant_id, core_loan_id, core_installment_id, core_partner_profile_id
       FROM atlas_sales.core_installment_links WHERE erp_installment_id = $1`,
    { bind: [erpInstallmentId], type: QueryTypes.SELECT, transaction },
  );
  const row = rows[0];
  return row
    ? {
        tenantId: row.core_tenant_id,
        loanId: row.core_loan_id,
        installmentId: row.core_installment_id,
        partnerProfileId: row.core_partner_profile_id,
      }
    : null;
}
