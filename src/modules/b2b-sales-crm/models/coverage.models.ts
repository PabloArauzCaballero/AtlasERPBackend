/**
 * Modelos de la cobertura BNPL añadidos por la migración 20260924200000 (P-04 / P-05).
 *
 * Sin decoradores de asociación a propósito: este archivo lo importa `b2b-sales-crm.models.ts`
 * para registrarlos, así que importar de vuelta sus clases crearía un ciclo. Las claves foráneas
 * viven en la base, que es donde se hacen cumplir.
 */
import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { SALES_SCHEMA } from '../b2b-sales-crm.enums';

export const SettlementStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus];

export const RecoveryMovementType = { PAYMENT: 'PAYMENT', REVERSAL: 'REVERSAL' } as const;
export type RecoveryMovementType = (typeof RecoveryMovementType)[keyof typeof RecoveryMovementType];

export const CoverageReviewReason = {
  PAYMENT_NOTICE_UNRESOLVED: 'PAYMENT_NOTICE_UNRESOLVED',
  COVERAGE_WITH_PENDING_NOTICE: 'COVERAGE_WITH_PENDING_NOTICE',
  CONTRACT_NOT_ACTIVE: 'CONTRACT_NOT_ACTIVE',
  /* El comercio confirmó en Core el pago de una cuota con cobertura viva (P-14): doble beneficio. */
  LATE_PAYMENT_WITH_COVERAGE: 'LATE_PAYMENT_WITH_COVERAGE',
} as const;
export type CoverageReviewReason = (typeof CoverageReviewReason)[keyof typeof CoverageReviewReason];

/** Cómo se cerró un elemento de la cola (migración 20260924400000). */
export const CoverageReviewResolution = {
  COVERAGE_SCHEDULED: 'COVERAGE_SCHEDULED',
  NOTICE_CONFIRMED: 'NOTICE_CONFIRMED',
  NOTICE_REJECTED: 'NOTICE_REJECTED',
  DISMISSED: 'DISMISSED',
} as const;
export type CoverageReviewResolution =
  (typeof CoverageReviewResolution)[keyof typeof CoverageReviewResolution];

/** Liquidación externa de una CxP ATLAS→comercio. Nace pendiente; la confirma otra persona. */
@Table({ schema: SALES_SCHEMA, tableName: 'merchant_payable_settlements', timestamps: false })
export class MerchantPayableSettlementModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, field: 'merchant_payable_id' })
  declare merchantPayableId: string;

  @Column({ type: DataType.STRING(120), field: 'settlement_reference' })
  declare settlementReference: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.UUID, field: 'beneficiary_account_id' })
  declare beneficiaryAccountId: string;

  @Column({ type: DataType.DATE, field: 'paid_at' })
  declare paidAt: Date;

  @Column({ type: DataType.UUID, field: 'evidence_file_id' })
  declare evidenceFileId: string;

  @Default(SettlementStatus.PENDING_APPROVAL)
  @Column(DataType.STRING(30))
  declare status: SettlementStatus;

  @Column({ type: DataType.UUID, field: 'registered_by_user_id' })
  declare registeredByUserId: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'registered_at' })
  declare registeredAt: Date;

  @Column({ type: DataType.UUID, field: 'decided_by_user_id' })
  declare decidedByUserId: string | null;

  @Column({ type: DataType.DATE, field: 'decided_at' })
  declare decidedAt: Date | null;

  @Column({ type: DataType.STRING(240), field: 'decision_note' })
  declare decisionNote: string | null;
}

/** Un cobro (o su reverso) aplicado a una CxC de recuperación. Sólo se inserta. */
@Table({ schema: SALES_SCHEMA, tableName: 'consumer_recovery_movements', timestamps: false })
export class ConsumerRecoveryMovementModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, field: 'recovery_id' })
  declare recoveryId: string;

  @Column({ type: DataType.UUID, field: 'installment_id' })
  declare installmentId: string;

  @Column({ type: DataType.STRING(20), field: 'movement_type' })
  declare movementType: RecoveryMovementType;

  @Column({ type: DataType.STRING(120), field: 'payment_reference' })
  declare paymentReference: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.UUID, field: 'reverses_movement_id' })
  declare reversesMovementId: string | null;

  @Column({ type: DataType.DATE, field: 'received_at' })
  declare receivedAt: Date;

  @Column({ type: DataType.UUID, field: 'recorded_by_user_id' })
  declare recordedByUserId: string | null;

  @Column(DataType.STRING(240))
  declare reason: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

/** Cola de revisión de cobertura: lo que ni se aprueba ni se rechaza solo. */
@Table({ schema: SALES_SCHEMA, tableName: 'coverage_review_items', timestamps: false })
export class CoverageReviewItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, field: 'installment_id' })
  declare installmentId: string;

  @Column(DataType.STRING(60))
  declare reason: CoverageReviewReason;

  @Default('OPEN')
  @Column(DataType.STRING(20))
  declare status: 'OPEN' | 'RESOLVED';

  @Default({})
  @Column(DataType.JSONB)
  declare details: Record<string, unknown>;

  @Column({ type: DataType.UUID, field: 'opened_by_user_id' })
  declare openedByUserId: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'opened_at' })
  declare openedAt: Date;

  @Column({ type: DataType.DATE, field: 'resolved_at' })
  declare resolvedAt: Date | null;

  @Column({ type: DataType.UUID, field: 'resolved_by_user_id' })
  declare resolvedByUserId: string | null;

  @Column({ type: DataType.STRING(240), field: 'resolution_note' })
  declare resolutionNote: string | null;

  @Column(DataType.STRING(30))
  declare resolution: CoverageReviewResolution | null;
}

export const coverageModels = [
  MerchantPayableSettlementModel,
  ConsumerRecoveryMovementModel,
  CoverageReviewItemModel,
];
