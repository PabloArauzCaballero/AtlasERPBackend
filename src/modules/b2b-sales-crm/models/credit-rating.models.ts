import {
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { SALES_SCHEMA } from '../b2b-sales-crm.enums';
import { B2BAccountModel, MerchantReceivableModel } from './b2b-sales-crm.models';

@Table({ schema: SALES_SCHEMA, tableName: 'rating_policy_versions', timestamps: false })
export class RatingPolicyVersionModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;

  @Column({ type: DataType.STRING(80), field: 'policy_code' }) declare policyCode: string;
  @Column({ type: DataType.STRING(40), field: 'version_code' }) declare versionCode: string;
  @Column({ type: DataType.STRING(40), field: 'scale_code' }) declare scaleCode: string;
  @Column(DataType.STRING(20)) declare status: string;
  @Column({ type: DataType.DATE, field: 'effective_from' }) declare effectiveFrom: Date;
  @Column({ type: DataType.DATE, field: 'effective_until' }) declare effectiveUntil: Date | null;

  /** Si el cliente hereda la PEOR categoría de sus cuentas por cobrar o sólo la de mayor saldo. */
  @Column({ type: DataType.BOOLEAN, field: 'contamination_enabled' })
  declare contaminationEnabled: boolean;

  @Column(DataType.TEXT) declare description: string | null;
  @Column({ type: DataType.DATE, field: 'created_at' }) declare createdAt: Date;
  @Column({ type: DataType.DATE, field: 'updated_at' }) declare updatedAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'rating_policy_bands', timestamps: false })
export class RatingPolicyBandModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;

  @ForeignKey(() => RatingPolicyVersionModel)
  @Column({ type: DataType.UUID, field: 'policy_version_id' })
  declare policyVersionId: string;

  @Column(DataType.STRING(4)) declare grade: string;
  @Column({ type: DataType.STRING(60), field: 'grade_label' }) declare gradeLabel: string;

  /** 0 es la mejor categoría. Es lo que decide el arrastre al calificar al cliente. */
  @Column({ type: DataType.INTEGER, field: 'severity_rank' }) declare severityRank: number;

  @Column({ type: DataType.INTEGER, field: 'min_days_past_due' }) declare minDaysPastDue: number;

  /** `null` = banda abierta, la última de la escala. */
  @Column({ type: DataType.INTEGER, field: 'max_days_past_due' }) declare maxDaysPastDue:
    number | null;

  /** Tanto por uno. `NUMERIC` llega como string para no perder precisión al pasar por JavaScript. */
  @Column({ type: DataType.DECIMAL(6, 4), field: 'provision_rate' }) declare provisionRate: string;

  @Column({ type: DataType.DATE, field: 'created_at' }) declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'receivable_risk_ratings', timestamps: false })
export class ReceivableRiskRatingModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;

  @ForeignKey(() => MerchantReceivableModel)
  @Column({ type: DataType.UUID, field: 'receivable_id' })
  declare receivableId: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  /** Con qué matriz se calificó: sin esto la cifra no es reproducible en el cierre siguiente. */
  @ForeignKey(() => RatingPolicyVersionModel)
  @Column({ type: DataType.UUID, field: 'policy_version_id' })
  declare policyVersionId: string;

  @Column(DataType.STRING(4)) declare grade: string;
  @Column({ type: DataType.STRING(60), field: 'grade_label' }) declare gradeLabel: string;
  @Column({ type: DataType.INTEGER, field: 'severity_rank' }) declare severityRank: number;
  @Column({ type: DataType.INTEGER, field: 'days_past_due' }) declare daysPastDue: number;
  @Column({ type: DataType.STRING(30), field: 'receivable_status' })
  declare receivableStatus: string;
  @Column({ type: DataType.DECIMAL(18, 2), field: 'exposure_amount' })
  declare exposureAmount: string;
  @Column({ type: DataType.DECIMAL(6, 4), field: 'provision_rate' }) declare provisionRate: string;
  @Column({ type: DataType.DECIMAL(18, 2), field: 'provision_amount' })
  declare provisionAmount: string;
  @Column({ type: DataType.STRING(4), field: 'previous_grade' }) declare previousGrade:
    string | null;
  @Column({ type: DataType.STRING(40), field: 'rating_reason' }) declare ratingReason: string;

  /** Puntero al presente sobre una tabla append-only: la calificación vigente es una sola. */
  @Column({ type: DataType.BOOLEAN, field: 'is_current' }) declare isCurrent: boolean;

  @Column({ type: DataType.DATE, field: 'rated_at' }) declare ratedAt: Date;
  @Column({ type: DataType.DATE, field: 'created_at' }) declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'b2b_account_risk_ratings', timestamps: false })
export class B2BAccountRiskRatingModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => RatingPolicyVersionModel)
  @Column({ type: DataType.UUID, field: 'policy_version_id' })
  declare policyVersionId: string;

  @Column(DataType.STRING(4)) declare grade: string;
  @Column({ type: DataType.STRING(60), field: 'grade_label' }) declare gradeLabel: string;
  @Column({ type: DataType.INTEGER, field: 'severity_rank' }) declare severityRank: number;
  @Column({ type: DataType.INTEGER, field: 'worst_days_past_due' })
  declare worstDaysPastDue: number;
  @Column({ type: DataType.INTEGER, field: 'rated_receivable_count' })
  declare ratedReceivableCount: number;
  @Column({ type: DataType.DECIMAL(18, 2), field: 'total_exposure_amount' })
  declare totalExposureAmount: string;
  @Column({ type: DataType.DECIMAL(18, 2), field: 'total_provision_amount' })
  declare totalProvisionAmount: string;

  /** El vencimiento que fijó la categoría. Es la respuesta a «¿por qué me bajaron?». */
  @Column({ type: DataType.UUID, field: 'driving_receivable_id' }) declare drivingReceivableId:
    string | null;

  @Column({ type: DataType.STRING(4), field: 'previous_grade' }) declare previousGrade:
    string | null;
  @Column({ type: DataType.STRING(40), field: 'rating_reason' }) declare ratingReason: string;
  @Column({ type: DataType.BOOLEAN, field: 'is_current' }) declare isCurrent: boolean;
  @Column({ type: DataType.DATE, field: 'rated_at' }) declare ratedAt: Date;
  @Column({ type: DataType.DATE, field: 'created_at' }) declare createdAt: Date;
}

/**
 * Los cuatro modelos del motor de calificación.
 *
 * Se registran juntos o no se registra ninguno: la matriz sin las calificaciones no califica nada, y
 * una calificación sin su matriz no se puede reproducir.
 */
export const creditRatingModels = [
  RatingPolicyVersionModel,
  RatingPolicyBandModel,
  ReceivableRiskRatingModel,
  B2BAccountRiskRatingModel,
];
