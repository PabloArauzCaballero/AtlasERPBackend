import { paperEntryContext } from '../../common/middleware/paper-entry.context';
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

describe('BusinessActionLogsService.record · origen del registro', () => {
  it('sin contexto de papel: ATLAS y el resumen tal cual', async () => {
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

  it('dentro de una petición de papel: ERP_PAPER y la serie en input_summary.paper', async () => {
    const { service, model } = servicio();
    await paperEntryContext.run(
      { serial: 'DOC-4F3A9C2E7B10', formCode: 'ERP-CRM-CUENTA-CREAR', formVersion: 'a91f3c2e' },
      () => service.record(base),
    );
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'ERP_PAPER',
        inputSummary: {
          legalName: 'Comercio SRL',
          paper: {
            serial: 'DOC-4F3A9C2E7B10',
            formCode: 'ERP-CRM-CUENTA-CREAR',
            formVersion: 'a91f3c2e',
          },
        },
      }),
      expect.anything(),
    );
  });

  it('un sourceSystem explícito del servicio no se pisa, pero la serie se anota igual', async () => {
    const { service, model } = servicio();
    await paperEntryContext.run({ serial: 'DOC-4F3A9C2E7B10' }, () =>
      service.record({ ...base, sourceSystem: 'ADS', inputSummary: null }),
    );
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'ADS',
        inputSummary: { paper: { serial: 'DOC-4F3A9C2E7B10', formCode: null, formVersion: null } },
      }),
      expect.anything(),
    );
  });
});

describe('BusinessActionLogsService.list · filtro por origen', () => {
  it('sourceSystem=ERP_PAPER acota la consulta a lo transcrito de papel', async () => {
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
