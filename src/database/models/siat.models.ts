import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * Tablas del núcleo fiscal SIAT (`20260926200000-siat-fiscal.sql`). Viven juntas porque sólo las
 * usa el módulo `fiscal/siat` y cambian a la vez; el documento fiscal está en su propio archivo.
 */

const uuidPk = {
  type: DataType.UUID,
  allowNull: false,
  primaryKey: true,
  defaultValue: DataType.UUIDV4,
} as const;

@Table({
  tableName: 'siat_issuer_profile',
  schema: 'atlas_accounting',
  timestamps: true,
  underscored: true,
})
export class SiatIssuerProfileModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;
  @Column({ type: DataType.UUID, field: 'branch_id', allowNull: true })
  declare branchId: string | null;
  @Column({ type: DataType.STRING(13), field: 'nit', allowNull: false }) declare nit: string;
  @Column({ type: DataType.STRING(200), field: 'razon_social', allowNull: false })
  declare razonSocial: string;
  @Column({ type: DataType.STRING(25), field: 'municipio', allowNull: false })
  declare municipio: string;
  @Column({ type: DataType.STRING(500), field: 'direccion', allowNull: false })
  declare direccion: string;
  @Column({ type: DataType.STRING(25), field: 'telefono', allowNull: true })
  declare telefono: string | null;
  @Column({ type: DataType.INTEGER, field: 'codigo_sucursal', allowNull: false, defaultValue: 0 })
  declare codigoSucursal: number;
  @Column({
    type: DataType.INTEGER,
    field: 'codigo_punto_venta',
    allowNull: false,
    defaultValue: 0,
  })
  declare codigoPuntoVenta: number;
  @Column({ type: DataType.SMALLINT, field: 'codigo_modalidad', allowNull: false, defaultValue: 2 })
  declare codigoModalidad: number;
  @Column({
    type: DataType.SMALLINT,
    field: 'codigo_documento_sector',
    allowNull: false,
    defaultValue: 1,
  })
  declare codigoDocumentoSector: number;
  @Column({ type: DataType.STRING(10), field: 'actividad_economica', allowNull: false })
  declare actividadEconomica: string;
  @Column({ type: DataType.STRING(200), field: 'leyenda_default', allowNull: true })
  declare leyendaDefault: string | null;
  @Column({ type: DataType.STRING(100), field: 'usuario_emisor', allowNull: false })
  declare usuarioEmisor: string;
  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

@Table({ tableName: 'siat_cuis', schema: 'atlas_accounting', timestamps: false, underscored: true })
export class SiatCuisModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: false })
  declare issuerProfileId: string;
  @Column({ type: DataType.STRING(100), field: 'codigo', allowNull: false }) declare codigo: string;
  @Column({ type: DataType.DATE, field: 'fecha_vigencia', allowNull: false })
  declare fechaVigencia: Date;
  @Column({
    type: DataType.DATE,
    field: 'obtained_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare obtainedAt: Date;
  @Column({ type: DataType.JSONB, field: 'raw_response', allowNull: true })
  declare rawResponse: unknown;
  @Column({ type: DataType.BOOLEAN, field: 'is_active', allowNull: false, defaultValue: true })
  declare isActive: boolean;
}

@Table({ tableName: 'siat_cufd', schema: 'atlas_accounting', timestamps: false, underscored: true })
export class SiatCufdModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: false })
  declare issuerProfileId: string;
  @Column({ type: DataType.UUID, field: 'cuis_id', allowNull: true }) declare cuisId: string | null;
  @Column({ type: DataType.STRING(120), field: 'codigo', allowNull: false }) declare codigo: string;
  @Column({ type: DataType.STRING(40), field: 'codigo_control', allowNull: false })
  declare codigoControl: string;
  @Column({ type: DataType.STRING(500), field: 'direccion', allowNull: true })
  declare direccion: string | null;
  @Column({ type: DataType.DATE, field: 'fecha_vigencia', allowNull: false })
  declare fechaVigencia: Date;
  @Column({
    type: DataType.DATE,
    field: 'obtained_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare obtainedAt: Date;
  @Column({ type: DataType.JSONB, field: 'raw_response', allowNull: true })
  declare rawResponse: unknown;
  @Column({ type: DataType.BOOLEAN, field: 'is_active', allowNull: false, defaultValue: true })
  declare isActive: boolean;
}

@Table({
  tableName: 'siat_number_series',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SiatNumberSeriesModel extends Model {
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', primaryKey: true, allowNull: false })
  declare issuerProfileId: string;
  @Column({ type: DataType.BIGINT, field: 'last_number', allowNull: false, defaultValue: 0 })
  declare lastNumber: string;
  @Column({
    type: DataType.DATE,
    field: 'updated_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare updatedAt: Date;
}

@Table({
  tableName: 'siat_significant_event',
  schema: 'atlas_accounting',
  timestamps: true,
  underscored: true,
})
export class SiatSignificantEventModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: false })
  declare issuerProfileId: string;
  @Column({ type: DataType.INTEGER, field: 'codigo_evento', allowNull: false })
  declare codigoEvento: number;
  @Column({ type: DataType.STRING(500), field: 'descripcion', allowNull: false })
  declare descripcion: string;
  @Column({ type: DataType.DATE, field: 'inicio', allowNull: false }) declare inicio: Date;
  @Column({ type: DataType.DATE, field: 'fin', allowNull: true }) declare fin: Date | null;
  @Column({ type: DataType.UUID, field: 'cufd_evento_id', allowNull: false })
  declare cufdEventoId: string;
  @Column({ type: DataType.UUID, field: 'cufd_envio_id', allowNull: true })
  declare cufdEnvioId: string | null;
  @Column({ type: DataType.BIGINT, field: 'codigo_recepcion_evento', allowNull: true })
  declare codigoRecepcionEvento: string | null;
  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'OPEN' })
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

@Table({
  tableName: 'siat_package',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SiatPackageModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'event_id', allowNull: false }) declare eventId: string;
  @Column({ type: DataType.INTEGER, field: 'cantidad_facturas', allowNull: false })
  declare cantidadFacturas: number;
  @Column({ type: DataType.STRING(64), field: 'hash_archivo', allowNull: false })
  declare hashArchivo: string;
  @Column({ type: DataType.INTEGER, field: 'bytes', allowNull: false }) declare bytes: number;
  @Column({ type: DataType.STRING(100), field: 'codigo_recepcion', allowNull: true })
  declare codigoRecepcion: string | null;
  @Column({ type: DataType.INTEGER, field: 'codigo_estado', allowNull: true })
  declare codigoEstado: number | null;
  @Column({ type: DataType.JSONB, field: 'mensajes', allowNull: false, defaultValue: [] })
  declare mensajes: unknown[];
  @Column({ type: DataType.DATE, field: 'sent_at', allowNull: true }) declare sentAt: Date | null;
  @Column({ type: DataType.DATE, field: 'validated_at', allowNull: true })
  declare validatedAt: Date | null;
  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}

@Table({
  tableName: 'siat_catalog_item',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SiatCatalogItemModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.STRING(40), field: 'catalog_code', allowNull: false })
  declare catalogCode: string;
  @Column({ type: DataType.STRING(40), field: 'codigo', allowNull: false }) declare codigo: string;
  @Column({ type: DataType.TEXT, field: 'descripcion', allowNull: false })
  declare descripcion: string;
  @Column({ type: DataType.JSONB, field: 'extra', allowNull: false, defaultValue: {} })
  declare extra: Record<string, unknown>;
  @Column({ type: DataType.BOOLEAN, field: 'simulated', allowNull: false, defaultValue: false })
  declare simulated: boolean;
  @Column({ type: DataType.DATE, field: 'synced_at', allowNull: false, defaultValue: DataType.NOW })
  declare syncedAt: Date;
}

@Table({
  tableName: 'siat_catalog_sync_run',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SiatCatalogSyncRunModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: false })
  declare issuerProfileId: string;
  @Column({ type: DataType.STRING(20), field: 'mode', allowNull: false }) declare mode: string;
  @Column({
    type: DataType.DATE,
    field: 'started_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare startedAt: Date;
  @Column({ type: DataType.DATE, field: 'finished_at', allowNull: true })
  declare finishedAt: Date | null;
  @Column({ type: DataType.JSONB, field: 'catalogs', allowNull: false, defaultValue: {} })
  declare catalogs: Record<string, number>;
  @Column({ type: DataType.BOOLEAN, field: 'ok', allowNull: true }) declare ok: boolean | null;
  @Column({ type: DataType.TEXT, field: 'error', allowNull: true }) declare error: string | null;
}

@Table({
  tableName: 'siat_transaction_log',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SiatTransactionLogModel extends Model {
  @Column({ ...uuidPk, field: 'id' }) declare id: string;
  @Column({ type: DataType.UUID, field: 'issuer_profile_id', allowNull: true })
  declare issuerProfileId: string | null;
  @Column({ type: DataType.STRING(60), field: 'operacion', allowNull: false })
  declare operacion: string;
  @Column({ type: DataType.STRING(20), field: 'mode', allowNull: false }) declare mode: string;
  @Column({ type: DataType.JSONB, field: 'request_redacted', allowNull: true })
  declare requestRedacted: unknown;
  @Column({ type: DataType.JSONB, field: 'response', allowNull: true }) declare response: unknown;
  @Column({ type: DataType.INTEGER, field: 'codigo_estado', allowNull: true })
  declare codigoEstado: number | null;
  @Column({ type: DataType.INTEGER, field: 'http_status', allowNull: true })
  declare httpStatus: number | null;
  @Column({ type: DataType.INTEGER, field: 'latency_ms', allowNull: false })
  declare latencyMs: number;
  @Column({ type: DataType.BOOLEAN, field: 'ok', allowNull: false }) declare ok: boolean;
  @Column({ type: DataType.TEXT, field: 'error', allowNull: true }) declare error: string | null;
  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}

export const siatModels = [
  SiatIssuerProfileModel,
  SiatCuisModel,
  SiatCufdModel,
  SiatNumberSeriesModel,
  SiatSignificantEventModel,
  SiatPackageModel,
  SiatCatalogItemModel,
  SiatCatalogSyncRunModel,
  SiatTransactionLogModel,
];
