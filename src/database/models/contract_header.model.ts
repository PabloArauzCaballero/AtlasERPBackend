import { Column, DataType, Default, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'contract_header',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ContractHeaderModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.STRING(30), field: 'contract_no', allowNull: false })
  declare contractNo: string;

  @Column({ type: DataType.STRING(30), field: 'contract_type', allowNull: false })
  declare contractType: string;

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;

  @Column({ type: DataType.UUID, field: 'counterparty_bp_id', allowNull: false })
  declare counterpartyBpId: string;

  @Column({ type: DataType.DATEONLY, field: 'start_date', allowNull: false })
  declare startDate: Date | string;

  @Column({ type: DataType.DATEONLY, field: 'end_date', allowNull: true })
  declare endDate: Date | string | null;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  /*
   * El estado inicial se declara aquí porque la tabla ya lo trae (`DEFAULT 'DRAFT'`) y el modelo
   * no lo copiaba.
   *
   * Sequelize valida `allowNull: false` en memoria ANTES de mandar el INSERT, así que el valor por
   * defecto de la base no llegaba a aplicarse nunca: crear un contrato contable fallaba siempre con
   * «ContractHeaderModel.status cannot be null». Por eso la tabla de contratos de Contabilidad
   * estaba vacía —no es que no se hubieran cargado: es que no se podía crear ninguno—.
   */
  @Default('DRAFT')
  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.UUID, field: 'signed_doc_id', allowNull: true })
  declare signedDocId: string | null;

  @Column({ type: DataType.UUID, field: 'approved_by', allowNull: true })
  declare approvedBy: string | null;

  @Column({ type: DataType.DATE, field: 'approved_at', allowNull: true })
  declare approvedAt: Date | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
