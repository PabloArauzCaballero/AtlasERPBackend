import { describirFaltantes, faltantesDelExpediente } from './expediente-del-comercio';

/**
 * «Qué le falta a la cuenta para que el expediente nazca sin huecos» tiene UNA definición: la usan
 * la compuerta del onboarding (422 con la lista) y la respuesta de la cuenta (`dossierMissing`).
 */
describe('faltantesDelExpediente', () => {
  const completa = {
    commercialRegistry: '00008022',
    legalRepFullName: 'Pablo Arauz Caballero',
    legalRepDocumentType: 'ci',
    legalRepDocumentNumber: '1234567',
    powerOfAttorneyFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a11',
    address: 'Av. Banzer km 2 1/2',
    city: 'Santa Cruz',
    bankQrFileId: '8b8f0f5e-3f55-4a47-9c3a-1b6f0b0e2a12',
    bankInstitutionCode: 'BNB',
    bankAccountMasked: '****0739',
  };

  it('una cuenta completa no tiene huecos', () => {
    expect(faltantesDelExpediente(completa)).toEqual([]);
  });

  it('un prospecto recién registrado tiene los cinco', () => {
    expect(faltantesDelExpediente({})).toEqual([
      'commercial_registry',
      'legal_representative',
      'power_of_attorney',
      'branch',
      'bank_qr',
    ]);
  });

  it('el representante exige nombre, tipo y número; la casa matriz, dirección y ciudad; el QR, archivo, entidad y cuenta', () => {
    expect(faltantesDelExpediente({ ...completa, legalRepDocumentNumber: '  ' })).toEqual([
      'legal_representative',
    ]);
    expect(faltantesDelExpediente({ ...completa, city: null })).toEqual(['branch']);
    expect(faltantesDelExpediente({ ...completa, bankAccountMasked: undefined })).toEqual([
      'bank_qr',
    ]);
  });

  it('describe lo que falta en una frase que la pantalla puede enseñar tal cual', () => {
    expect(describirFaltantes(['commercial_registry'])).toBe('la matrícula de comercio');
    expect(describirFaltantes(['power_of_attorney', 'bank_qr'])).toBe(
      'el poder notarial del representante y el QR bancario de cobro (imagen, entidad y cuenta)',
    );
    expect(describirFaltantes([])).toBe('');
  });
});
