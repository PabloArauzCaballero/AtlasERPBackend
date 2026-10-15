import { createHash } from 'crypto';

export interface SealedJournalLine {
  lineNo: number;
  glAccountId: string;
  debit: unknown;
  credit: unknown;
}

/**
 * Sello SHA-256 del asiento al publicarse: identifica el documento, su asiento y cada línea
 * (número, cuenta, debe y haber). Es lo que queda en `journal_entry.hash_sha256` y en la auditoría.
 */
export function sealJournal(entry: {
  documentId: string;
  journalId: string;
  lines: readonly SealedJournalLine[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        documentId: entry.documentId,
        journalId: entry.journalId,
        lines: entry.lines.map((line) => ({
          lineNo: line.lineNo,
          glAccountId: line.glAccountId,
          debit: line.debit,
          credit: line.credit,
        })),
      }),
    )
    .digest('hex');
}
