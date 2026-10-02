/**
 * Lo que el expediente del comercio en Atlas exige para enviarse a revisión, mirado desde la
 * cuenta B2B del ERP.
 *
 * Hasta el 2026-10-02 el ERP abría el expediente con seis campos y los cuatro requisitos
 * —matrícula, representante legal con poder, una sucursal y el QR bancario— quedaban vacíos: el
 * comercio tenía que volver a entregar en su portal lo que el vendedor ya había capturado, y hasta
 * entonces «Pedir verificación al Motor» fallaba con `PARTNER_NOT_UNDER_REVIEW`. Pablo: «el usuario
 * te lo pasa una vez y esto debe estar listo y cargado».
 *
 * Esta función es la ÚNICA definición de «qué falta»: la usan la compuerta que abre el onboarding
 * (409 con la lista) y la respuesta de la cuenta (`dossierMissing`), para que la pantalla diga lo
 * mismo que el servidor rechaza. Es pura: sin base, sin red.
 */
export const DOSSIER_REQUIREMENTS = [
  'commercial_registry',
  'legal_representative',
  'power_of_attorney',
  'branch',
  'bank_qr',
] as const;
export type DossierRequirement = (typeof DOSSIER_REQUIREMENTS)[number];

export const DOSSIER_REQUIREMENT_LABELS: Record<DossierRequirement, string> = {
  commercial_registry: 'la matrícula de comercio',
  legal_representative: 'el representante legal (nombre y documento)',
  power_of_attorney: 'el poder notarial del representante',
  branch: 'la casa matriz (dirección y ciudad)',
  bank_qr: 'el QR bancario de cobro (imagen, entidad y cuenta)',
};

export interface AccountDossierFields {
  commercialRegistry?: string | null;
  legalRepFullName?: string | null;
  legalRepDocumentType?: string | null;
  legalRepDocumentNumber?: string | null;
  powerOfAttorneyFileId?: string | null;
  address?: string | null;
  city?: string | null;
  bankQrFileId?: string | null;
  bankInstitutionCode?: string | null;
  bankAccountMasked?: string | null;
}

const lleno = (value: string | null | undefined): boolean =>
  Boolean(value && value.trim().length > 0);

/** Qué le falta a la cuenta para que el expediente nazca sin huecos. Vacío = completa. */
export function faltantesDelExpediente(account: AccountDossierFields): DossierRequirement[] {
  const faltan: DossierRequirement[] = [];
  if (!lleno(account.commercialRegistry)) faltan.push('commercial_registry');
  if (
    !lleno(account.legalRepFullName) ||
    !lleno(account.legalRepDocumentType) ||
    !lleno(account.legalRepDocumentNumber)
  ) {
    faltan.push('legal_representative');
  }
  if (!lleno(account.powerOfAttorneyFileId)) faltan.push('power_of_attorney');
  if (!lleno(account.address) || !lleno(account.city)) faltan.push('branch');
  if (
    !lleno(account.bankQrFileId) ||
    !lleno(account.bankInstitutionCode) ||
    !lleno(account.bankAccountMasked)
  ) {
    faltan.push('bank_qr');
  }
  return faltan;
}

/** Frase para un 409/422: «la matrícula de comercio, el poder notarial del representante y el QR…». */
export function describirFaltantes(faltan: readonly DossierRequirement[]): string {
  const partes = faltan.map((item) => DOSSIER_REQUIREMENT_LABELS[item]);
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
