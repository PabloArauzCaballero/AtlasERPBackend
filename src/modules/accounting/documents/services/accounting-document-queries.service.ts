import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import {
  AccountingDocumentModel,
  JournalEntryLineModel,
  JournalEntryModel,
} from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

/** Tope de página del listado: el mismo 500 que devolvía antes sin parámetros. */
export const DOCUMENT_LIST_MAX_PAGE_SIZE = 500;

/** Lecturas del documento contable y su asiento. */
@Injectable()
export class AccountingDocumentQueries {
  constructor(
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingDocumentModel)
    private readonly accountingDocumentModel: typeof AccountingDocumentModel,
    @InjectModel(JournalEntryModel) private readonly journalEntryModel: typeof JournalEntryModel,
    @InjectModel(JournalEntryLineModel)
    private readonly journalEntryLineModel: typeof JournalEntryLineModel,
  ) {}

  /**
   * Listado paginado de documentos, filtrado por las entidades del token EN LA CONSULTA (ATL-05).
   *
   * Antes traía los 500 más recientes de TODAS las entidades y filtraba después: un contable de
   * una entidad con pocos documentos no veía los suyos si otra entidad tenía 500 más recientes, y
   * `total` era el tamaño de la ventana. Ahora el WHERE va antes del LIMIT, el orden es estable
   * (fecha DESC, id DESC) y `total` es un COUNT con el mismo filtro. Sin parámetros devuelve la
   * primera página de 500, que es lo que el ERP web espera hoy.
   */
  async list(user: AuthUser, query: { page?: number; pageSize?: number } = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DOCUMENT_LIST_MAX_PAGE_SIZE;
    const allowed = this.legalEntityAccessService.accessibleLegalEntityIds(user);
    if (allowed !== null && allowed.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const where = allowed === null ? {} : { legalEntityId: { [Op.in]: [...allowed] } };
    const { rows, count } = await this.accountingDocumentModel.findAndCountAll({
      where,
      order: [
        ['documentDate', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items: rows, total: count, page, pageSize };
  }

  /**
   * El documento vivo (no anulado) de una clave de origen, en cualquier libro, bloqueado para
   * actualizar. Es lo que permite a un flujo de integración RECUPERAR un documento que un intento
   * anterior creó y no llegó a enlazar, en vez de crear otro (P-06).
   */
  findActiveDocumentBySource(
    source: { sourceSystem: string; sourceType: string; sourceId: string },
    transaction: Transaction,
  ): Promise<AccountingDocumentModel | null> {
    return this.accountingDocumentModel.findOne({
      where: { ...source, status: { [Op.ne]: 'VOID' } },
      order: [['createdAt', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  /** El reverso vivo (no anulado) de un documento, bloqueado para actualizar. */
  findActiveReversalOf(
    originalId: string,
    transaction: Transaction,
  ): Promise<AccountingDocumentModel | null> {
    return this.accountingDocumentModel.findOne({
      where: { reversalOfId: originalId, status: { [Op.ne]: 'VOID' } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  /**
   * El documento bloqueado para actualizar (404 si no existe). El bloqueo es lo que hace cierta la
   * comprobación de estado que sigue: bajo `READ COMMITTED`, dos operaciones simultáneas sobre el
   * mismo documento leerían ambas el mismo estado y lo cambiarían dos veces.
   */
  async lockDocument(id: string, transaction: Transaction): Promise<AccountingDocumentModel> {
    const document = await this.accountingDocumentModel.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!document) throw documentNotFound();
    return document;
  }

  /**
   * El documento para quien lo pide por HTTP: existe (404 si no) Y es de una entidad legal de su
   * token (403 si no).
   *
   * `getDocument` a secas no mira al usuario —lo usan flujos internos que ya autorizaron la
   * operación dentro de su transacción—, y el controlador lo llamaba directamente: cualquier
   * contable o CFO leía el asiento de otra entidad con sólo conocer su id (P-13).
   */
  async getDocumentForUser(id: string, user: AuthUser) {
    const result = await this.getDocument(id);
    this.legalEntityAccessService.assertCanAccessLegalEntity(user, result.document.legalEntityId);
    return result;
  }

  async getDocument(id: string, transaction?: Transaction) {
    this.logger.debug('Consulta de documento contable.', {
      layer: 'service',
      module: 'accounting-documents',
      action: 'getDocument',
      accountingDocumentId: id,
      insideTransaction: Boolean(transaction),
    });
    const findOptions = transaction ? { transaction } : undefined;
    const document = await this.accountingDocumentModel.findByPk(id, findOptions);
    if (!document) throw documentNotFound();

    const { journal, lines } = await this.loadJournalWithLines(id, transaction);
    return { document, journal, lines };
  }

  /** El asiento del documento y sus líneas por número; sin asiento, sin líneas. */
  async loadJournalWithLines(accountingDocumentId: string, transaction?: Transaction) {
    const journal = await this.journalEntryModel.findOne({
      where: { accountingDocumentId },
      ...(transaction ? { transaction } : {}),
    });
    const lines = journal
      ? await this.journalEntryLineModel.findAll({
          where: { journalEntryId: journal.id },
          ...(transaction ? { transaction } : {}),
          order: [['lineNo', 'ASC']],
        })
      : [];
    return { journal, lines };
  }
}

/** El asiento que un documento publicado o reversable debe tener: sin él, 409. */
export function assertJournalExists<T>(journal: T | null, message: string): asserts journal is T {
  if (!journal) {
    throw new ConflictException({ code: 'JOURNAL_ENTRY_NOT_FOUND', message });
  }
}

function documentNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'ACCOUNTING_DOCUMENT_NOT_FOUND',
    message: 'El documento contable no existe.',
  });
}
