import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Lo que distingue un registro TRANSCRITO de un papel de uno tecleado.
 *
 * El ERP imprime formularios en blanco para que gente sin pantalla los rellene a mano; alguien los
 * pasa después al sistema usando la misma pantalla de siempre. Sin esta marca, ese registro es
 * indistinguible de uno tecleado en directo, y el número de serie impreso al pie del papel —lo
 * único que une el papel con la fila— se perdería. El cliente lo declara con tres cabeceras:
 *
 *   x-atlas-entry-channel: PAPER
 *   x-atlas-paper-serial:  DOC-4F3A9C2E7B10      (el documentId que imprimió el generador)
 *   x-atlas-paper-form:    ERP-CRM-CUENTA-CREAR@a91f3c2e   (opcional: código@versión)
 *
 * Vive en un `AsyncLocalStorage` y no en la petición porque quien lo consume es
 * `BusinessActionLogsService.record`, que está varias capas por debajo del controlador y al que
 * ningún servicio pasa la petición. Así la marca llega a la auditoría sin tocar cada servicio.
 */
export interface PaperEntry {
  serial: string;
  formCode?: string;
  formVersion?: string;
}

export const PAPER_SERIAL_PATTERN = /^DOC-[0-9A-F]{12}$/;
export const PAPER_FORM_PATTERN = /^([A-Z0-9][A-Z0-9-]{2,63})(?:@([A-Za-z0-9._-]{1,16}))?$/;

const storage = new AsyncLocalStorage<PaperEntry>();

export const paperEntryContext = {
  run<T>(entry: PaperEntry, callback: () => T): T {
    return storage.run(entry, callback);
  },
  get(): PaperEntry | undefined {
    return storage.getStore();
  },
};

/** Interpreta las cabeceras; `null` si la petición no viene de un papel. Lanza si viene mal. */
export function parsePaperEntryHeaders(headers: {
  channel?: string | undefined;
  serial?: string | undefined;
  form?: string | undefined;
}): PaperEntry | null {
  const channel = headers.channel?.trim().toUpperCase();
  if (!channel) return null;
  if (channel !== 'PAPER') {
    throw new Error(`Canal de entrada desconocido: «${headers.channel}». Sólo se admite PAPER.`);
  }
  const serial = headers.serial?.trim().toUpperCase() ?? '';
  if (!PAPER_SERIAL_PATTERN.test(serial)) {
    throw new Error(
      'Una transcripción desde papel necesita el número de serie impreso al pie (DOC- y doce caracteres hexadecimales).',
    );
  }
  const entry: PaperEntry = { serial };
  const form = headers.form?.trim();
  if (form) {
    const match = PAPER_FORM_PATTERN.exec(form);
    if (!match)
      throw new Error(`Formulario de papel mal formado: «${form}». Se espera CODIGO@version.`);
    entry.formCode = match[1];
    if (match[2]) entry.formVersion = match[2];
  }
  return entry;
}
