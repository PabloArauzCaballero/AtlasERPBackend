import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'loan_schedule',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class LoanScheduleModel extends Model {
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

  @Column({ type: DataType.INTEGER, field: 'installment_no', allowNull: false })
  declare installmentNo: number;

  @Column({ type: DataType.DATEONLY, field: 'due_date', allowNull: false })
  declare dueDate: Date | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'principal_due',
    allowNull: false,
    defaultValue: 0,
  })
  declare principalDue: number | string;

  @Column({
    type: DataType.DECIMAL(18, 2),
    field: 'interest_due',
    allowNull: false,
    defaultValue: 0,
  })
  declare interestDue: number | string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'fee_due', allowNull: false, defaultValue: 0 })
  declare feeDue: number | string;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;
}
