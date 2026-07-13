import { businessActionLogQuerySchema } from '../src/modules/business-action-logs/business-action-logs.schemas';

describe('BusinessActionLogs schemas', () => {
  it('normaliza paginación por defecto', () => {
    const result = businessActionLogQuerySchema.parse({ moduleCode: 'ACCOUNTING' });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it('rechaza rango de fechas invertido', () => {
    const result = businessActionLogQuerySchema.safeParse({ from: '2026-07-31', to: '2026-07-01' });

    expect(result.success).toBe(false);
  });
});
