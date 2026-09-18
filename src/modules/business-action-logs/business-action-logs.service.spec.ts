import { BusinessActionLogsService } from './business-action-logs.service';
import type { RecordBusinessActionLogInput } from './business-action-logs.types';

const base: RecordBusinessActionLogInput = {
  moduleCode: 'B2B_SALES_CRM',
  businessProcess: 'B2B_ACCOUNT_ONBOARDING',
  actionCode: 'CREATE_ACCOUNT_WITH_PRIMARY_CONTACT',
  affectedTables: ['b2b_sales.b2b_accounts'],
  affectedRecordCount: 1,
  status: 'SUCCESS',
  inputSummary: { legalName: 'Comercio SRL' },
};

function servicio() {
  const model = { create: jest.fn(async (values: unknown) => values) };
  const logger = { infoContext: jest.fn() };
  const service = new BusinessActionLogsService(model as never, logger as never);
  return { service, model };
}

/**
 * Hasta el 2026-09-18 había un tercer origen: `ERP_PAPER`, que escribía la serie del formulario en
 * papel del que se había transcrito el registro. Esa función se retiró entera del producto, así
 * que aquí ya sólo quedan los dos que el ERP escribe hoy. Lo que sí se sigue probando es que un
 * `sourceSystem` puesto por el servicio NO se pise, porque es lo que distingue a Ads de lo demás.
 */
describe('BusinessActionLogsService.record · origen del registro', () => {
  it('por defecto, ATLAS y el resumen tal cual', async () => {
    const { service, model } = servicio();
    await service.record(base);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'ATLAS',
        inputSummary: { legalName: 'Comercio SRL' },
      }),
      expect.anything(),
    );
  });

  it('un sourceSystem explícito del servicio no se pisa', async () => {
    const { service, model } = servicio();
    await service.record({ ...base, sourceSystem: 'ADS', inputSummary: null });
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'ADS', inputSummary: null }),
      expect.anything(),
    );
  });
});

describe('BusinessActionLogsService.list · filtro por origen', () => {
  /*
   * El filtro sigue admitiendo `ERP_PAPER` a propósito: las filas escritas antes del 2026-09-18 lo
   * llevan, y son historia que hay que poder encontrar. Lo que ya no existe es quien lo escriba.
   */
  it('sourceSystem=ERP_PAPER sigue acotando la consulta a lo que se transcribió en su día', async () => {
    const model = { findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })) };
    const service = new BusinessActionLogsService(
      model as never,
      { infoContext: jest.fn() } as never,
    );
    await service.list({ page: 1, pageSize: 25, sourceSystem: 'ERP_PAPER' });
    expect(model.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sourceSystem: 'ERP_PAPER' }) }),
    );
  });
});
