import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'intercompany_pair',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class IntercompanyPairModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'source_document_id', allowNull: false })
  declare sourceDocumentId: string;

  @Column({ type: DataType.UUID, field: 'target_document_id', allowNull: true })
  declare targetDocumentId: string | null;

  @Column({ type: DataType.UUID, field: 'source_legal_entity_id', allowNull: false })
  declare sourceLegalEntityId: string;

  @Column({ type: DataType.UUID, field: 'target_legal_entity_id', allowNull: false })
  declare targetLegalEntityId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount', allowNull: false })
  declare amount: number | string;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false, defaultValue: 'BOB' })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(20), field: 'match_status', allowNull: false })
  declare matchStatus: string;
}
