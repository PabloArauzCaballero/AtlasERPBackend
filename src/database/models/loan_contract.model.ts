import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'loan_contract',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class LoanContractModel extends Model {
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

  @Column({ type: DataType.UUID, field: 'lender_bp_id', allowNull: false })
  declare lenderBpId: string;

  @Column({ type: DataType.STRING(40), field: 'loan_no', allowNull: false })
  declare loanNo: string;

  @Column({ type: DataType.STRING(30), field: 'loan_type', allowNull: false })
  declare loanType: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'principal_amount', allowNull: false })
  declare principalAmount: number | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'current_principal',
    allowNull: false,
    defaultValue: 0,
  })
  declare currentPrincipal: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.DECIMAL(12, 6), field: 'interest_rate', allowNull: true })
  declare interestRate: number | string | null;

  @Column({ type: DataType.STRING(20), field: 'rate_type', allowNull: false })
  declare rateType: string;

  @Column({ type: DataType.DATEONLY, field: 'start_date', allowNull: false })
  declare startDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'maturity_date', allowNull: false })
  declare maturityDate: Date | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
}
