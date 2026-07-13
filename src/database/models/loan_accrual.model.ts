import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'loan_accrual',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class LoanAccrualModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'loan_contract_id', allowNull: false })
  declare loanContractId: string;

  @Column({ type: DataType.DATEONLY, field: 'accrual_date', allowNull: false })
  declare accrualDate: Date | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'interest_amount',
    allowNull: false,
    defaultValue: 0,
  })
  declare interestAmount: number | string;

  @Column({ type: DataType.UUID, field: 'journal_entry_id', allowNull: true })
  declare journalEntryId: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
