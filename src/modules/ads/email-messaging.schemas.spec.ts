import { createEmailSuppressionSchema, sendCampaignEmailSchema } from './email-messaging.schemas';

describe('Ads email messaging schemas', () => {
  it('accepts a campaign email with recipient variables', () => {
    const result = sendCampaignEmailSchema.parse({
      campaignId: '11111111-1111-4111-a111-111111111111',
      subject: 'Hola {{recipient.name}}',
      htmlBody: '<h1>Oferta</h1>',
      recipients: [{ email: 'cliente@example.com', name: 'Ana', variables: { discount: 10 } }],
    });
    expect(result.recipients).toHaveLength(1);
  });

  it('rejects more than 500 recipients', () => {
    const result = sendCampaignEmailSchema.safeParse({
      campaignId: '11111111-1111-4111-a111-111111111111',
      subject: 'Oferta',
      htmlBody: '<p>Oferta</p>',
      recipients: Array.from({ length: 501 }, (_, index) => ({
        email: `user${index}@example.com`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it('normalizes the allowed suppression reasons', () => {
    expect(
      createEmailSuppressionSchema.parse({ email: 'x@example.com', reason: 'UNSUBSCRIBE' }).reason,
    ).toBe('UNSUBSCRIBE');
  });
});
