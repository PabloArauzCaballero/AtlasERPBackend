import { MerchantFolderService } from './merchant-folder.service';

/**
 * El ERP entrega el expediente COMPLETO a Atlas al abrir el onboarding (Pablo, 2026-10-02): tres
 * llamadas porque el poder y el QR viven bajo el prefijo del ERP y el expediente sólo acepta objetos
 * bajo el del comercio, que no existe hasta que la ficha existe. Lo que Atlas no reclama en `gaps`
 * no se vuelve a copiar.
 */
type Fila = Record<string, unknown>;

function build(
  opts: { cuenta?: Fila | null; archivos?: Record<string, Fila>; respuestas?: Fila[] } = {},
) {
  const cuenta: Fila = {
    legal_name: 'Multicenter S.R.L.',
    trade_name: 'Multicenter',
    tax_id: '1028341029',
    category: 'HOGAR',
    city: 'Santa Cruz',
    address: 'Av. Banzer km 2 1/2',
    email: 'cobros@ejemplo.bo',
    phone: null,
    commercial_registry: '00008022',
    legal_rep_full_name: 'Pablo Arauz Caballero',
    legal_rep_document_type: 'ci',
    legal_rep_document_number: '1234567',
    power_of_attorney_file_id: 'f-poder',
    bank_qr_file_id: 'f-qr',
    bank_institution_code: 'BNB',
    bank_account_masked: '****0739',
    ...(opts.cuenta ?? {}),
  };
  const archivos = opts.archivos ?? {
    'f-poder': {
      storage_public_id: '1/erp-B2B_ACCOUNT-acc/poder.pdf',
      mime_type: 'application/pdf',
      byte_size: 10,
    },
    'f-qr': {
      storage_public_id: '1/erp-B2B_ACCOUNT-acc/qr.png',
      mime_type: 'image/png',
      byte_size: 20,
    },
  };
  const sequelize = {
    query: jest.fn(async (sql: string, options: { replacements: Record<string, string> }) => {
      if (sql.includes('FROM atlas_sales.b2b_accounts'))
        return opts.cuenta === null ? [] : [cuenta];
      if (sql.includes('FROM atlas_accounting.erp_file')) {
        const archivo = archivos[options.replacements.fileId ?? ''];
        return archivo ? [archivo] : [];
      }
      return [];
    }),
  };
  const respuestas = [...(opts.respuestas ?? [])];
  const forward = jest.fn(async (input: { path: string; body?: Fila }) => {
    if (input.path.endsWith('/upload-url')) {
      return {
        uploadUrl: `https://almacen/${input.body?.documentKind}`,
        storageKey: `1/partner-p1/${input.body?.documentKind}/x`,
        requiredHeaders: { 'content-type': String(input.body?.contentType) },
      };
    }
    return (
      respuestas.shift() ?? {
        partnerId: 'p1',
        expedienteId: 'e1',
        created: false,
        reason: null,
        gaps: [],
      }
    );
  });
  const atlas = {
    forward,
    forwardBinary: jest.fn(async () => ({
      buffer: Buffer.from('bytes'),
      contentType: 'application/octet-stream',
    })),
    putSigned: jest.fn(async () => undefined),
  };
  const logger = { warn: jest.fn(), info: jest.fn() };
  const service = new MerchantFolderService(atlas as never, logger as never, sequelize as never);
  return { service, atlas, forward, sequelize, logger };
}

describe('MerchantFolderService · el expediente completo desde el ERP', () => {
  it('con Atlas reclamando representante y QR: asegura, copia los dos archivos a la carpeta del comercio y entrega con envío', async () => {
    const { service, forward, atlas } = build({
      respuestas: [
        {
          partnerId: 'p1',
          expedienteId: 'e1',
          created: true,
          reason: null,
          gaps: ['legal_representative', 'power_of_attorney', 'bank_qr'],
        },
        {
          partnerId: 'p1',
          expedienteId: 'e1',
          created: false,
          reason: null,
          gaps: [],
          onboardingStatus: 'under_review',
        },
      ],
    });

    const resultado = await service.ensureForAccount('acc', 'tok');

    // (1) la ficha con lo que no lleva archivo: matrícula, rubro y la casa matriz como sucursal
    const primera = forward.mock.calls[0]?.[0] as { body: Fila };
    expect(primera.body).toMatchObject({
      erpAccountId: 'acc',
      commercialRegistry: '00008022',
      businessCategory: 'HOGAR',
      branch: { branchCode: 'CASA-MATRIZ', addressLine: 'Av. Banzer km 2 1/2', city: 'Santa Cruz' },
    });
    expect(primera.body).not.toHaveProperty('legalRepresentative');
    // (2) dos copias: leer los bytes con la sesión, pedir permiso bajo partner-p1 y subir a la URL firmada
    expect(atlas.forwardBinary).toHaveBeenCalledTimes(2);
    expect(atlas.putSigned).toHaveBeenCalledTimes(2);
    expect(forward).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'operations/erp-documents/merchant-expediente/p1/upload-url',
        body: { documentKind: 'bank-qr', contentType: 'image/png', sizeBytes: 5 },
      }),
    );
    // (3) lo que lleva archivo, con las claves nuevas, y el envío
    const ultima = forward.mock.calls.at(-1)?.[0] as { body: Fila };
    expect(ultima.body).toMatchObject({
      legalRepresentative: {
        fullName: 'Pablo Arauz Caballero',
        documentType: 'ci',
        documentNumber: '1234567',
        powerOfAttorneyKey: '1/partner-p1/power-of-attorney/x',
      },
      bankQr: {
        qrKind: 'bank',
        storageKey: '1/partner-p1/bank-qr/x',
        bankInstitutionCode: 'BNB',
        accountNumberMasked: '****0739',
      },
      submitWhenComplete: true,
    });
    expect(resultado).toMatchObject({ onboardingStatus: 'under_review', gaps: [] });
  });

  it('lo que Atlas ya tiene no se vuelve a copiar: con gaps vacíos basta la primera llamada', async () => {
    const { service, forward, atlas } = build({
      respuestas: [{ partnerId: 'p1', expedienteId: 'e1', created: false, reason: null, gaps: [] }],
    });
    await service.ensureForAccount('acc', 'tok');
    expect(forward).toHaveBeenCalledTimes(1);
    expect(atlas.forwardBinary).not.toHaveBeenCalled();
    expect(atlas.putSigned).not.toHaveBeenCalled();
  });

  it('si sólo falta el QR, sólo se copia el QR', async () => {
    const { service, forward, atlas } = build({
      respuestas: [
        { partnerId: 'p1', expedienteId: 'e1', created: false, reason: null, gaps: ['bank_qr'] },
        { partnerId: 'p1', expedienteId: 'e1', created: false, reason: null, gaps: [] },
      ],
    });
    await service.ensureForAccount('acc', 'tok');
    expect(atlas.putSigned).toHaveBeenCalledTimes(1);
    const ultima = forward.mock.calls.at(-1)?.[0] as { body: Fila };
    expect(ultima.body.legalRepresentative).toBeNull();
    expect(ultima.body.bankQr).toMatchObject({ qrKind: 'bank' });
  });

  it('un archivo borrado no rompe la entrega: el requisito queda pendiente y Atlas lo dirá en gaps', async () => {
    const { service, atlas, logger } = build({
      archivos: {
        'f-qr': {
          storage_public_id: '1/erp-B2B_ACCOUNT-acc/qr.png',
          mime_type: 'image/png',
          byte_size: 20,
        },
      },
      respuestas: [
        {
          partnerId: 'p1',
          expedienteId: 'e1',
          created: false,
          reason: null,
          gaps: ['power_of_attorney', 'bank_qr'],
        },
        {
          partnerId: 'p1',
          expedienteId: 'e1',
          created: false,
          reason: null,
          gaps: ['power_of_attorney'],
        },
      ],
    });
    const resultado = await service.ensureForAccount('acc', 'tok');
    expect(atlas.putSigned).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no existe'),
      expect.objectContaining({ fileId: 'f-poder' }),
    );
    expect(resultado.gaps).toEqual(['power_of_attorney']);
  });

  it('si Atlas no deja ficha (sin correo, cuenta enlazada a otra), no intenta copiar nada', async () => {
    const { service, atlas } = build({
      respuestas: [
        { partnerId: null, expedienteId: null, created: false, reason: 'SIN_CORREO_DE_CONTACTO' },
      ],
    });
    const resultado = await service.ensureForAccount('acc', 'tok');
    expect(resultado.reason).toBe('SIN_CORREO_DE_CONTACTO');
    expect(atlas.forwardBinary).not.toHaveBeenCalled();
  });

  it('una cuenta que no existe responde sin llamar a Atlas', async () => {
    const { service, forward } = build({ cuenta: null });
    await expect(service.ensureForAccount('nadie', 'tok')).resolves.toMatchObject({
      reason: 'CUENTA_NO_ENCONTRADA',
    });
    expect(forward).not.toHaveBeenCalled();
  });

  it('tryEnsureForAccount nunca tumba a quien llama: un fallo de Atlas vuelve como ATLAS_NO_RESPONDIO', async () => {
    const { service, forward } = build();
    forward.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.tryEnsureForAccount('acc', 'tok')).resolves.toMatchObject({
      reason: 'ATLAS_NO_RESPONDIO',
    });
  });
});
