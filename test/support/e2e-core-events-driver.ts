/**
 * Conductor de la prueba de extremo a extremo LOCAL Core ↔ ERP (P-14 · B20). No es una suite de
 * Jest: lo lanza a mano quien verifica, con el ERP y Core compilados y levantados.
 *
 *   DATABASE_URL=postgres://…/erp_e2e npx ts-node --transpile-only test/support/e2e-core-events-driver.ts \
 *     <coreTenantId> <coreLoanId> <coreInstallment1> <coreInstallment2> <corePartnerProfileId>
 *
 * Siembra una compra sintética de dos cuotas vencidas ligadas a las cuotas de Core indicadas y
 * liquida la cobertura de la SEGUNDA con los servicios reales (programar, registrar la liquidación
 * con evidencia, confirmarla otra persona): eso escribe `b2b.coverage.settled` con `coreRef` en el
 * outbox, que el worker compilado entrega a Core. Imprime los ids en JSON.
 */
import { randomUUID } from 'node:crypto';
import { addDays, businessDate } from '../../src/common/time/business-date';
import { linkCoreInstallment } from '../../src/modules/b2b-sales-crm/services/core-installment-link.support';

async function main(): Promise<void> {
  // El andamiaje de pruebas usa `jest.fn` para el portador de trazas; fuera de Jest basta la función.
  (globalThis as unknown as { jest: unknown }).jest = {
    fn: (impl?: (...args: unknown[]) => unknown) => impl ?? (() => undefined),
  };
  const { addEvidenceFile, buildCoverageHarness, seedPurchase } =
    await import('./coverage-fixtures');
  const [tenantId, loanId, first, second, partnerId] = process.argv.slice(2) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const h = await buildCoverageHarness(process.env.DATABASE_URL!);
  try {
    const past = addDays(businessDate(), -5);
    const purchase = await seedPurchase(h.sequelize, {
      installments: [
        { dueDate: past, amount: '333.33' },
        { dueDate: past, amount: '333.33' },
      ],
    });
    for (const [index, coreInstallmentId] of [first, second].entries()) {
      await h.sequelize.transaction((transaction) =>
        linkCoreInstallment(
          h.sequelize,
          {
            erpPurchaseId: purchase.purchaseId,
            erpInstallmentId: purchase.installments[index]!.id,
            coreTenantId: tenantId,
            coreLoanId: loanId,
            coreInstallmentId,
            corePartnerProfileId: partnerId,
          },
          transaction,
        ),
      );
    }
    const covered = purchase.installments[1]!.id;
    const payable = await h.coverage.scheduleCoverage(
      {
        installmentId: covered,
        scheduledPaymentDate: businessDate(),
        reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
      },
      { userId: '11111111-1111-4111-8111-111111111111' },
    );
    const payableId = payable.id as string;
    await h.coverage.markPayablePaid(
      payableId,
      {
        settlementReference: `LIQ-E2E-${randomUUID().slice(0, 8)}`,
        amount: '333.33',
        currency: 'BOB',
        beneficiaryAccountId: purchase.merchantAccountId,
        paidAt: new Date(Date.now() - 60_000),
        evidenceFileId: await addEvidenceFile(h.sequelize, payableId),
      },
      { userId: '11111111-1111-4111-8111-111111111111' },
    );
    await h.coverage.approvePayableSettlement(
      payableId,
      {},
      { userId: '22222222-2222-4222-8222-222222222222' },
    );
    console.log(
      JSON.stringify({
        purchaseId: purchase.purchaseId,
        erpInstallments: purchase.installments.map((i) => i.id),
        payableId,
      }),
    );
  } finally {
    await h.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
