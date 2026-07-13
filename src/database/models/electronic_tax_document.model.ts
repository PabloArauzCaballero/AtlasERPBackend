import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'electronic_tax_document',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class ElectronicTaxDocumentModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'ar_invoice_id', allowNull: false })
  declare arInvoiceId: string;

  @Column({ type: DataType.STRING(120), field: 'cuf', allowNull: true })
  declare cuf: string | null;

  @Column({ type: DataType.STRING(120), field: 'cufd', allowNull: true })
  declare cufd: string | null;

  @Column({ type: DataType.STRING(30), field: 'siat_status', allowNull: false })
  declare siatStatus: string;

  @Column({ type: DataType.STRING(64), field: 'xml_hash', allowNull: true })
  declare xmlHash: string | null;

  @Column({ type: DataType.STRING(240), field: 'graphic_representation_url', allowNull: true })
  declare graphicRepresentationUrl: string | null;

  @Column({
    type: DataType.BOOLEAN,
    field: 'contingency_flag',
    allowNull: false,
    defaultValue: false,
  })
  declare contingencyFlag: boolean;

  @Column({ type: DataType.DATE, field: 'emitted_at', allowNull: true })
  declare emittedAt: Date | null;
}
