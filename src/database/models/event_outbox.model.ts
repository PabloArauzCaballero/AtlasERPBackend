import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'event_outbox',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class EventOutboxModel extends Model {
  // `autoIncrement` faltaba, y sin él Sequelize incluye `id` en el INSERT y su propia
  // validación lo rechaza con «id cannot be null» antes de llegar a la base — donde la
  // columna SÍ tiene su secuencia (`event_outbox_id_seq`) y habría funcionado sola.
  @Column({
    type: DataType.BIGINT,
    field: 'id',
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({ type: DataType.STRING(120), field: 'topic', allowNull: false })
  declare topic: string;

  @Column({ type: DataType.STRING(40), field: 'aggregate_type', allowNull: false })
  declare aggregateType: string;

  @Column({ type: DataType.UUID, field: 'aggregate_id', allowNull: false })
  declare aggregateId: string;

  @Column({ type: DataType.STRING(160), field: 'event_key', allowNull: false })
  declare eventKey: string;

  @Column({ type: DataType.JSONB, field: 'payload', allowNull: false })
  declare payload: Record<string, unknown>;

  /**
   * Portador W3C del contexto de traza, escrito al publicar y leído por el worker al reclamar.
   *
   * Va FUERA de `payload` a propósito: ese campo es el contrato de dominio del evento y lo que
   * saldrá hacia un broker. Aquí sólo viven `traceparent` y, si existe, `tracestate`; nunca un
   * dato de negocio. `null` en las filas anteriores a la migración `20260918230000`, que el
   * worker procesa igual abriendo su propia traza.
   */
  @Column({ type: DataType.JSONB, field: 'trace_context', allowNull: true })
  declare traceContext: Record<string, string> | null;

  /**
   * Momento del ACK duradero del receptor (2xx). Lo asigna SÓLO el worker tras la confirmación;
   * nunca un productor ni un log. Ver migración `20260924100000-outbox-entrega-real`.
   */
  @Column({ type: DataType.DATE, field: 'published_at', allowNull: true })
  declare publishedAt: Date | null;

  /**
   * PENDING | PUBLISHED | DEAD | LEGACY_LOG_ONLY. Los productores no lo escriben: la base pone
   * PENDING por defecto. El resto de columnas de entrega son del worker.
   */
  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false, defaultValue: 'PENDING' })
  declare status: 'PENDING' | 'PUBLISHED' | 'DEAD' | 'LEGACY_LOG_ONLY';

  @Column({ type: DataType.INTEGER, field: 'attempts', allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({
    type: DataType.DATE,
    field: 'next_attempt_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare nextAttemptAt: Date;

  @Column({ type: DataType.STRING(120), field: 'lease_owner', allowNull: true })
  declare leaseOwner: string | null;

  @Column({ type: DataType.DATE, field: 'lease_expires_at', allowNull: true })
  declare leaseExpiresAt: Date | null;

  @Column({ type: DataType.DATE, field: 'last_attempt_at', allowNull: true })
  declare lastAttemptAt: Date | null;

  /** Error de la última entrega, ya redactado (sin cuerpo, cabeceras ni secretos). */
  @Column({ type: DataType.STRING(500), field: 'last_error', allowNull: true })
  declare lastError: string | null;

  @Column({ type: DataType.SMALLINT, field: 'last_http_status', allowNull: true })
  declare lastHttpStatus: number | null;

  @Column({ type: DataType.DATE, field: 'dead_at', allowNull: true })
  declare deadAt: Date | null;

  @Column({ type: DataType.INTEGER, field: 'replay_count', allowNull: false, defaultValue: 0 })
  declare replayCount: number;

  /** Versión del esquema del `payload`; el productor la sube con un cambio incompatible. */
  @Column({ type: DataType.INTEGER, field: 'schema_version', allowNull: false, defaultValue: 1 })
  declare schemaVersion: number;

  /** Versión monótona por agregado; la asigna un trigger al insertar (no la escribe el productor). */
  @Column({ type: DataType.BIGINT, field: 'aggregate_version', allowNull: true })
  declare aggregateVersion: string | null;

  @Column({
    type: DataType.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
