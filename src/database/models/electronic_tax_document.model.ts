import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'electronic_tax_document',
  schema: 'atlas_accounting',
  timestamps: true,
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

  /** Sólo para las filas de factura AR; la fuente general es `sourceType` + `sourceId`. */
  @Column({ type: DataType.UUID, field: 'ar_invoice_id', allowNull: true })
  declare arInvoiceId: string | null;

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

  @Column({ type: DataType.STRING(30), field: 'source_type', allowNull: true })
  declare sourceType: string | null;

  @Column({ type: DataType.UUID, field: 'source_id', allowNull: true })
  declare sourceId: string | null;

  @Column({ type: DataType.UUID, field: 'superseded_by_id', allowNull: true })
  declare supersededById: string | null;

  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: true })
  declare issuerProfileId: string | null;

  @Column({ type: DataType.BIGINT, field: 'numero_factura', allowNull: true })
  declare numeroFactura: string | null;

  @Column({ type: DataType.STRING(100), field: 'cuis', allowNull: true })
  declare cuis: string | null;

  @Column({ type: DataType.UUID, field: 'cufd_id', allowNull: true })
  declare cufdId: string | null;

  @Column({ type: DataType.SMALLINT, field: 'codigo_documento_sector', allowNull: true })
  declare codigoDocumentoSector: number | null;

  @Column({ type: DataType.SMALLINT, field: 'tipo_factura_documento', allowNull: true })
  declare tipoFacturaDocumento: number | null;

  @Column({ type: DataType.SMALLINT, field: 'codigo_emision', allowNull: true })
  declare codigoEmision: number | null;

  @Column({ type: DataType.SMALLINT, field: 'codigo_modalidad', allowNull: true })
  declare codigoModalidad: number | null;

  @Column({ type: DataType.SMALLINT, field: 'codigo_excepcion', allowNull: true })
  declare codigoExcepcion: number | null;

  /** `fechaEmision` exacta del XML (hora local, sin zona): entra en el CUF. */
  @Column({ type: DataType.STRING(23), field: 'fecha_emision', allowNull: true })
  declare fechaEmision: string | null;

  @Column({ type: DataType.STRING(100), field: 'codigo_recepcion', allowNull: true })
  declare codigoRecepcion: string | null;

  @Column({ type: DataType.INTEGER, field: 'codigo_estado_sin', allowNull: true })
  declare codigoEstadoSin: number | null;

  @Column({ type: DataType.JSONB, field: 'mensajes', allowNull: false, defaultValue: [] })
  declare mensajes: unknown[];

  @Column({ type: DataType.BLOB, field: 'xml_gzip', allowNull: true })
  declare xmlGzip: Buffer | null;

  @Column({ type: DataType.STRING(64), field: 'xml_sha256', allowNull: true })
  declare xmlSha256: string | null;

  @Column({ type: DataType.JSONB, field: 'receptor_snapshot', allowNull: true })
  declare receptorSnapshot: Record<string, unknown> | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'monto_total', allowNull: true })
  declare montoTotal: string | null;

  @Column({ type: DataType.INTEGER, field: 'attempt_count', allowNull: false, defaultValue: 0 })
  declare attemptCount: number;

  @Column({ type: DataType.TEXT, field: 'last_error', allowNull: true })
  declare lastError: string | null;

  @Column({ type: DataType.DATE, field: 'next_attempt_at', allowNull: true })
  declare nextAttemptAt: Date | null;

  @Column({ type: DataType.DATE, field: 'sent_at', allowNull: true })
  declare sentAt: Date | null;

  @Column({ type: DataType.UUID, field: 'event_id', allowNull: true })
  declare eventId: string | null;

  @Column({ type: DataType.UUID, field: 'package_id', allowNull: true })
  declare packageId: string | null;

  @Column({ type: DataType.SMALLINT, field: 'annulment_motivo', allowNull: true })
  declare annulmentMotivo: number | null;

  @Column({ type: DataType.DATE, field: 'annulled_at', allowNull: true })
  declare annulledAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
