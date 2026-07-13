import {
  auditQuerySchema,
  bulkCreateAdvertisersSchema,
  bulkTrackEventsSchema,
  createAdvertiserSchema,
  createBillingProfileSchema,
  moderationDecisionSchema,
  periodCloseSchema,
  updateCampaignStatusSchema,
} from './ads.schemas';

describe('Ads Zod schemas', () => {
  it('valida lote de eventos publicitarios y aplica límite máximo', () => {
    const event = {
      eventType: 'IMPRESSION',
      deliveryDecisionId: '00000000-0000-4000-8000-000000000001',
      requestId: '00000000-0000-4000-8000-000000000002',
    };

    const accepted = bulkTrackEventsSchema.safeParse({ items: [event] });
    const rejected = bulkTrackEventsSchema.safeParse({
      items: Array.from({ length: 501 }, () => event),
    });

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it('rechaza anunciantes duplicados dentro del batch por país y taxId', () => {
    const advertiser = {
      legalName: 'Empresa Publicitaria SRL',
      tradeName: 'Marca Publicitaria',
      taxId: '123456789',
      country: 'BO',
      billingMode: 'POSTPAID',
    };

    const result = bulkCreateAdvertisersSchema.safeParse({
      items: [advertiser, { ...advertiser, tradeName: 'Otra Marca' }],
    });

    expect(result.success).toBe(false);
  });

  it('validates advertiser creation payload', () => {
    const parsed = createAdvertiserSchema.parse({
      legalName: 'Empresa Ejemplo SRL',
      tradeName: 'Marca Ejemplo',
      taxId: '123456789',
      country: 'bo',
      billingMode: 'POSTPAID',
    });

    expect(parsed.country).toBe('BO');
    expect(parsed.currency).toBe('BOB');
  });

  it('validates billing profile fiscal payload', () => {
    const parsed = createBillingProfileSchema.parse({
      fiscalName: 'Empresa Ejemplo SRL',
      taxId: '123456789',
      billingEmail: 'facturacion@example.com',
      country: 'bo',
    });

    expect(parsed.country).toBe('BO');
    expect(parsed.isDefault).toBe(true);
  });

  it('rejects campaign status update without a useful reason', () => {
    const result = updateCampaignStatusSchema.safeParse({ status: 'PAUSED', reason: 'x' });
    expect(result.success).toBe(false);
  });

  it('does not allow pending review as final moderation decision', () => {
    const result = moderationDecisionSchema.safeParse({
      reviewStatus: 'PENDING_REVIEW',
      reasonCode: 'POLICY_OK',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reversed billing periods', () => {
    const result = periodCloseSchema.safeParse({
      periodStart: '2026-07-31',
      periodEnd: '2026-07-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reversed audit date ranges', () => {
    const result = auditQuerySchema.safeParse({ from: '2026-07-31', to: '2026-07-01' });
    expect(result.success).toBe(false);
  });
});
