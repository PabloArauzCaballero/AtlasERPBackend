/**
 * Qué tipos de requisito exigen ARCHIVO para completarse. Los tipos son texto libre al abrir el
 * caso (`itemType`), así que se decide por familia: lo legal y documental lleva papel; lo operativo
 * o técnico (una visita, una configuración) se completa sin él.
 */
const EVIDENCE_REQUIRED_ITEM_TYPES = new Set([
  'LEGAL',
  'NIT',
  'MATRICULA',
  'PODER',
  'KYB',
  'DOCUMENTO',
  'CONTRATO',
  'FISCAL',
]);

export function requiresEvidence(itemType: string): boolean {
  return EVIDENCE_REQUIRED_ITEM_TYPES.has(
    String(itemType ?? '')
      .trim()
      .toUpperCase(),
  );
}

export function describeChecklistItem(item: {
  id: string;
  itemType: string;
  description: string;
  status: string;
  completedByUserId: string | null;
  evidenceStorageKey?: string | null;
  evidenceContentType?: string | null;
  evidenceSizeBytes?: number | null;
  evidenceUploadedAt?: Date | null;
}): Record<string, unknown> {
  return {
    id: item.id,
    itemType: item.itemType,
    description: item.description,
    status: item.status,
    completedByUserId: item.completedByUserId,
    requiresEvidence: requiresEvidence(item.itemType),
    hasEvidence: Boolean(item.evidenceStorageKey),
    evidenceContentType: item.evidenceContentType ?? null,
    evidenceSizeBytes: item.evidenceSizeBytes ?? null,
    evidenceUploadedAt: item.evidenceUploadedAt ?? null,
  };
}

/**
 * El nombre con el que el archivo de un requisito aparece en la carpeta del comercio: su
 * descripción («NIT vigente del comercio» → `NIT-vigente-del-comercio`), que es lo que un operador
 * reconoce; el tipo (`LEGAL`) si no la hay. AtlasBackend sólo admite `[A-Za-z0-9_-]`: es un tramo
 * de la ruta del objeto.
 */
export function claseDelRequisito(
  description: string | null | undefined,
  itemType: string,
): string {
  const legible = (description ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return legible || itemType;
}
