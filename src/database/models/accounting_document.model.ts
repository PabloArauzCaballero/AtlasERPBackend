import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'accounting_document',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class AccountingDocumentModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;

  @Column({ type: DataType.STRING(30), field: 'source_system', allowNull: false })
  declare sourceSystem: string;

  @Column({ type: DataType.STRING(30), field: 'source_type', allowNull: false })
  declare sourceType: string;

  @Column({ type: DataType.STRING(80), field: 'source_id', allowNull: false })
  declare sourceId: string;

  @Column({ type: DataType.STRING(30), field: 'document_type', allowNull: false })
  declare documentType: string;

  @Column({ type: DataType.STRING(40), field: 'document_no', allowNull: false })
  declare documentNo: string;

  @Column({ type: DataType.DATEONLY, field: 'document_date', allowNull: false })
  declare documentDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'posting_date', allowNull: false })
  declare postingDate: Date | string;

  @Column({ type: DataType.UUID, field: 'accounting_period_id', allowNull: false })
  declare accountingPeriodId: string;

  @Column({ type: DataType.UUID, field: 'ledger_id', allowNull: false })
  declare ledgerId: string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.STRING(20), field: 'approval_status', allowNull: false })
  declare approvalStatus: string;

  @Column({ type: DataType.UUID, field: 'reversal_of_id', allowNull: true })
  declare reversalOfId: string | null;

  @Column({ type: DataType.UUID, field: 'reversed_by_id', allowNull: true })
  declare reversedById: string | null;

  @Column({ type: DataType.UUID, field: 'policy_snapshot_id', allowNull: true })
  declare policySnapshotId: string | null;

  @Column({ type: DataType.UUID, field: 'created_by', allowNull: true })
  declare createdBy: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
