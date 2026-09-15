import { CatalogService } from '../src/modules/catalog/catalog.service';
import { splitDomainNames } from '../src/modules/catalog/catalog.schemas';
import {
  createAccountingDocumentSchema,
  createBusinessPartnerSchema,
  createEntityLinkSchema,
  issueArInvoiceSchema,
  updateArInvoiceSchema,
  updateBusinessPartnerSchema,
  updateContractHeaderSchema,
  updateReceiptSchema,
} from '../src/modules/accounting/shared/schemas/accounting.schemas';
import {
  createContractFromProposalSchema,
  createMerchantUserSchema,
  listBranchesQuerySchema,
  registerMerchantPaymentSchema,
} from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import {
  createBillingProfileSchema,
  createInventoryPlacementSchema,
  createPolicyRuleSchema,
  registerPaymentSchema,
} from '../src/modules/ads/ads.schemas';

/**
 * Los campos que eran texto libre contra un dominio cerrado (2026-09-15).
 *
 * Cada caso prueba las dos caras: lo que antes entraba y era basura ahora es 400 con la ruta del
 * campo, y lo que ya estaba guardado —los valores medidos en dev y los que mandan las siembras y los
 * guiones de humo— sigue entrando.
 */

const pathOf = (result: {
  success: boolean;
  error?: { issues: { path: (string | number)[] }[] };
}) => (result.success ? null : result.error!.issues.map((issue) => issue.path.join('.')));

const uuid = '11111111-1111-4111-8111-111111111111';

describe('contabilidad', () => {
  const document = {
    legalEntityId: uuid,
    sourceSystem: 'ACCOUNTING',
    sourceType: 'MANUAL',
    sourceId: 'X-1',
    documentType: 'JOURNAL',
    documentNo: 'DOC-1',
    documentDate: '2026-09-15',
    postingDate: '2026-09-15',
    accountingPeriodId: uuid,
    ledgerId: uuid,
    currencyCode: 'BOB',
    lines: [
      { glAccountId: uuid, debit: 10, currencyCode: 'BOB' },
      { glAccountId: uuid, credit: 10, currencyCode: 'BOB' },
    ],
  };

  it('el documento contable conserva sus defectos y acepta lo que escriben siembra y humo', () => {
    const parsed = createAccountingDocumentSchema.parse(document);
    expect(parsed.approvalStatus).toBe('NOT_REQUIRED');
    expect(
      createAccountingDocumentSchema.safeParse({
        ...document,
        sourceSystem: 'SMOKE',
        sourceType: 'BATCH_VALIDATION',
      }).success,
    ).toBe(true);
  });

  it('un estado de aprobación fuera del CHECK es 400 con su campo, no un 500 de base de datos', () => {
    const result = createAccountingDocumentSchema.safeParse({ ...document, approvalStatus: 'OK' });
    expect(pathOf(result)).toEqual(['approvalStatus']);
  });

  /*
   * Decisión: sistema, tipo de origen y tipo de documento son la clave de integración de quien
   * importa (y la de idempotencia de los lotes). Siguen abiertos; el catálogo sólo los sugiere.
   */
  it('sistema, tipo de origen y tipo de documento siguen abiertos para los importadores', () => {
    const result = createAccountingDocumentSchema.safeParse({
      ...document,
      sourceSystem: 'ATLAS_ERP',
      sourceType: 'IMPORTACION',
      documentType: 'MANUAL',
    });
    expect(result.success).toBe(true);
  });

  it('GOVERNMENT, que la base admitía, ya se puede dar de alta', () => {
    const result = createBusinessPartnerSchema.safeParse({
      partnerNo: 'BP-9',
      partnerType: 'GOVERNMENT',
      legalName: 'Alcaldía',
    });
    expect(result.success).toBe(true);
  });

  it('un business partner se puede bloquear y archivar', () => {
    expect(updateBusinessPartnerSchema.safeParse({ status: 'BLOCKED' }).success).toBe(true);
    expect(updateBusinessPartnerSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(true);
    expect(pathOf(updateBusinessPartnerSchema.safeParse({ status: 'BORRADO' }))).toEqual([
      'status',
    ]);
  });

  it('la relación de un vínculo sale del dominio y mantiene DEFAULT por defecto', () => {
    expect(createEntityLinkSchema.parse({ entityType: 'LEDGER', entityId: uuid }).relation).toBe(
      'DEFAULT',
    );
    expect(
      pathOf(
        createEntityLinkSchema.safeParse({
          entityType: 'LEDGER',
          entityId: uuid,
          relation: 'GASTO',
        }),
      ),
    ).toEqual(['relation']);
  });

  it('el estado SIAT de la factura electrónica se valida y conserva PENDING', () => {
    const base = {
      legalEntityId: uuid,
      customerBpId: uuid,
      invoiceDate: '2026-09-15',
      dueDate: '2026-09-30',
      currencyCode: 'BOB',
      netAmount: 100,
      arAccountId: uuid,
      revenueAccountId: uuid,
      description: 'Servicio',
      accountingPeriodId: uuid,
      ledgerId: uuid,
    };
    expect(
      issueArInvoiceSchema.parse({ ...base, electronicTaxDocument: {} }).electronicTaxDocument
        ?.siatStatus,
    ).toBe('PENDING');
    expect(
      pathOf(
        issueArInvoiceSchema.safeParse({ ...base, electronicTaxDocument: { siatStatus: 'ok' } }),
      ),
    ).toEqual(['electronicTaxDocument.siatStatus']);
  });

  describe('los tres PATCH que no validaban', () => {
    it('recibo: estado fuera del CHECK es 400; las claves ajenas se descartan como antes', () => {
      expect(pathOf(updateReceiptSchema.safeParse({ status: 'PAGADO' }))).toEqual(['status']);
      expect(updateReceiptSchema.parse({ status: 'VOID', amount: 99 })).toEqual({ status: 'VOID' });
    });

    it('contrato: ya no guarda cualquier cadena como estado o tipo', () => {
      expect(
        pathOf(updateContractHeaderSchema.safeParse({ status: 'x', contractType: 'y' })),
      ).toEqual(['contractType', 'status']);
      expect(updateContractHeaderSchema.parse({ endDate: null, startDate: '2026-01-01' })).toEqual({
        endDate: null,
        startDate: '2026-01-01',
      });
    });

    it('factura AR: CANCELLED no existe en el CHECK', () => {
      expect(pathOf(updateArInvoiceSchema.safeParse({ status: 'CANCELLED' }))).toEqual(['status']);
      expect(updateArInvoiceSchema.safeParse({ status: 'VOID' }).success).toBe(true);
    });

    it('las fechas siguen viajando como texto: la fila devuelta no cambia de forma', () => {
      expect(updateArInvoiceSchema.parse({ dueDate: '2026-10-01' }).dueDate).toBe('2026-10-01');
    });
  });
});

describe('CRM comercial', () => {
  it('ciclo y política del contrato mantienen sus defectos y rechazan texto libre', () => {
    const base = { proposalId: uuid, contractNumber: 'CTR-1', startDate: '2026-09-15' };
    const parsed = createContractFromProposalSchema.parse(base);
    expect([parsed.billingCycle, parsed.settlementPolicy]).toEqual(['MONTHLY', 'PER_CONTRACT']);
    expect(
      pathOf(createContractFromProposalSchema.safeParse({ ...base, billingCycle: 'mensual' })),
    ).toEqual(['billingCycle']);
  });

  it('el rol de una persona del comercio es uno de los del portal', () => {
    const base = { accountId: uuid, email: 'a@b.bo', fullName: 'Ana Pérez' };
    expect(
      createMerchantUserSchema.safeParse({ ...base, roleCode: 'MERCHANT_OPERATOR' }).success,
    ).toBe(true);
    expect(pathOf(createMerchantUserSchema.safeParse({ ...base, roleCode: 'ADMIN' }))).toEqual([
      'roleCode',
    ]);
  });

  it('el medio de pago del comercio usa el vocabulario de condiciones de pago', () => {
    const base = {
      accountId: uuid,
      amount: 10,
      paidAt: '2026-09-15',
      allocations: [{ receivableId: uuid, amountApplied: 10 }],
    };
    expect(registerMerchantPaymentSchema.safeParse({ ...base, paymentMethod: 'QR' }).success).toBe(
      true,
    );
    expect(
      pathOf(registerMerchantPaymentSchema.safeParse({ ...base, paymentMethod: 'transferencia' })),
    ).toEqual(['paymentMethod']);
  });

  it('filtrar sucursales por un estado inexistente es 400, no una lista vacía', () => {
    expect(pathOf(listBranchesQuerySchema.safeParse({ status: 'ACTIVAS' }))).toEqual(['status']);
    expect(listBranchesQuerySchema.safeParse({ status: 'SUSPENDED' }).success).toBe(true);
  });
});

describe('publicidad', () => {
  it('superficie y formatos del espacio son cerrados', () => {
    const base = { placementCode: 'TOP_BANNER' };
    expect(
      createInventoryPlacementSchema.safeParse({
        ...base,
        surface: 'MERCHANT_PORTAL',
        allowedFormats: ['TEXT_CARD', 'IMAGE_BANNER'],
      }).success,
    ).toBe(true);
    expect(
      pathOf(
        createInventoryPlacementSchema.safeParse({
          ...base,
          surface: 'portal',
          allowedFormats: ['GIF'],
        }),
      ),
    ).toEqual(['surface', 'allowedFormats.0']);
  });

  it('categoría de política, medio de cobro y régimen tributario', () => {
    expect(
      pathOf(
        createPolicyRuleSchema.safeParse({
          policyCode: 'NO_X',
          category: 'finanzas',
          ruleType: 'WARNING',
        }),
      ),
    ).toEqual(['category']);
    expect(
      registerPaymentSchema.safeParse({
        amountMicros: 1000,
        paymentDate: '2026-09-15',
        paymentMethod: 'TRANSFERENCIA',
      }).success,
    ).toBe(true);
    const profile = { fiscalName: 'Empresa SRL', taxId: '123456', billingEmail: 'f@e.bo' };
    expect(
      createBillingProfileSchema.safeParse({ ...profile, taxRegime: 'REGIMEN GENERAL' }).success,
    ).toBe(true);
    expect(
      pathOf(createBillingProfileSchema.safeParse({ ...profile, taxRegime: 'general' })),
    ).toEqual(['taxRegime']);
  });
});

describe('servicio de catálogo', () => {
  const service = new CatalogService();

  it('publica todos los dominios con código y etiqueta', () => {
    const { domains } = service.list();
    expect(Object.keys(domains).length).toBeGreaterThanOrEqual(90);
    expect(domains['crm.riskTier']).toEqual([
      { code: 'LOW', label: 'Bajo' },
      { code: 'MEDIUM', label: 'Medio' },
      { code: 'HIGH', label: 'Alto' },
      { code: 'CRITICAL', label: 'Crítico' },
    ]);
  });

  it('filtra por nombre y un nombre desconocido es un error, no un select vacío', () => {
    expect(Object.keys(service.list(['ads.surface', 'crm.riskTier']).domains)).toEqual([
      'ads.surface',
      'crm.riskTier',
    ]);
    expect(() => service.list(['crm.noExiste'])).toThrow('No existe el dominio «crm.noExiste».');
  });

  it('un dominio suelto lleva su descripción y la ayuda cuando la hay', () => {
    const domain = service.one('accounting.glAccountStatus');
    expect(domain?.description).toBe('Estado de una cuenta contable.');
    expect(domain?.options.find((option) => option.code === 'ARCHIVED')?.help).toBeTruthy();
    expect(service.one('accounting.noExiste')).toBeUndefined();
  });

  it('parte la lista de nombres de la query ignorando huecos', () => {
    expect(splitDomainNames(' ads.surface, ,crm.riskTier ')).toEqual([
      'ads.surface',
      'crm.riskTier',
    ]);
    expect(splitDomainNames('')).toBeUndefined();
    expect(splitDomainNames(undefined)).toBeUndefined();
  });

  it('ningún código es un UUID: se imprime y se escribe a mano', () => {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    const codes = Object.values(service.list().domains).flatMap((options) =>
      options.map((option) => option.code),
    );
    expect(codes.filter((code) => uuidLike.test(code))).toEqual([]);
  });
});
