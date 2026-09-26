import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AccountingDocumentModel, DocumentAuditLogModel } from '../../../../database/models';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { LegalEntityAccessService } from '../../../../common/services/legal-entity-access.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { ApprovalDecision, assertCanDecide, notPendingConflict } from '../domain/document-approval';
import { AccountingDocumentsService } from './accounting-documents.service';

/**
 * Aprobar o rechazar un borrador contable PENDING (ATL-03, provisional hasta DEC-10).
 *
 * La carrera aprobar ∥ rechazar (o dos aprobadores a la vez) la resuelve la base, no la lectura:
 * el UPDATE va condicionado a `status='DRAFT' AND approval_status='PENDING'`, así que sólo una
 * transacción cambia la fila y la otra encuentra 0 filas y responde 409.
 */
@Injectable()
export class DocumentApprovalService {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly legalEntityAccessService: LegalEntityAccessService,
    private readonly documentsService: AccountingDocumentsService,
    private readonly logger: PinoLoggerService,
    @InjectModel(AccountingDocumentModel)
    private readonly accountingDocumentModel: typeof AccountingDocumentModel,
    @InjectModel(DocumentAuditLogModel)
    private readonly auditLogModel: typeof DocumentAuditLogModel,
  ) {}

  approve(id: string, user: AuthUser, reason?: string) {
    return this.decide(id, user, 'APPROVED', reason);
  }

  reject(id: string, user: AuthUser, reason?: string) {
    return this.decide(id, user, 'REJECTED', reason);
  }

  private async decide(id: string, user: AuthUser, decision: ApprovalDecision, reason?: string) {
    this.logger.info('Decisión de aprobación de documento contable recibida.', {
      layer: 'service',
      module: 'accounting-documents',
      action: decision === 'APPROVED' ? 'approveDocument' : 'rejectDocument',
      accountingDocumentId: id,
      userId: user.sub,
    });

    return this.sequelize.transaction(async (transaction) => {
      const document = await this.accountingDocumentModel.findByPk(id, { transaction });
      if (!document) {
        throw new NotFoundException({
          code: 'ACCOUNTING_DOCUMENT_NOT_FOUND',
          message: 'El documento contable no existe.',
        });
      }
      this.legalEntityAccessService.assertCanAccessLegalEntity(user, document.legalEntityId);
      assertCanDecide(document, user.sub);

      const now = new Date();
      const values =
        decision === 'APPROVED'
          ? { approvalStatus: 'APPROVED', approvedBy: user.sub, approvedAt: now }
          : { approvalStatus: 'REJECTED', rejectedBy: user.sub, rejectedAt: now };
      const [affected] = await this.accountingDocumentModel.update(values, {
        where: { id, status: 'DRAFT', approvalStatus: 'PENDING' },
        transaction,
      });
      if (affected !== 1) {
        // Otra transacción decidió (o publicó) entre la lectura y el UPDATE.
        const current = await this.accountingDocumentModel.findByPk(id, { transaction });
        throw notPendingConflict({
          status: current?.status ?? document.status,
          approvalStatus: current?.approvalStatus ?? document.approvalStatus,
        });
      }

      await this.auditLogModel.create(
        {
          accountingDocumentId: id,
          eventType: decision,
          eventPayload: { previousApprovalStatus: 'PENDING', reason: reason ?? null },
          actorId: user.sub,
        },
        { transaction },
      );

      this.logger.info('Documento contable decidido.', {
        layer: 'service',
        module: 'accounting-documents',
        action: 'decideApproval',
        accountingDocumentId: id,
        decision,
        userId: user.sub,
      });
      return this.documentsService.getDocument(id, transaction);
    });
  }
}
