import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { SALES_SCHEMA } from '../b2b-sales-crm.enums';
import type { SegmentDefinition } from '../../../common/segmentation/rule-engine';
import type { CrmSegmentAttribute, SegmentSubject } from '../domain/crm-segments';
import { InternalUserModel } from './b2b-sales-crm.models';

/**
 * Un segmento comercial: una definicion de reglas y el sujeto al que se le aplican.
 *
 * `timestamps: true` —y no la convencion de este modulo de llevarlos a mano— porque el segmento se
 * EDITA: cambiar la regla y no mover `updated_at` deja un catalogo donde todo parece recien creado
 * y nada dice cuando se movio el criterio que cambio quien entra.
 */
@Table({
  schema: SALES_SCHEMA,
  tableName: 'crm_segments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
})
export class CrmSegmentModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;

  @AllowNull(false) @Column(DataType.STRING(30)) declare subject: SegmentSubject;
  @AllowNull(false) @Column(DataType.STRING(140)) declare name: string;
  @Column(DataType.TEXT) declare description: string | null;

  @AllowNull(false)
  @Column({ type: DataType.JSONB, field: 'definition_json' })
  declare definitionJson: SegmentDefinition<CrmSegmentAttribute>;

  /* Con `@Default`: un `allowNull: false` sin valor por defecto en el modelo anula el DEFAULT de
   * la tabla y el alta falla con «status cannot be null». */
  @AllowNull(false) @Default('ACTIVE') @Column(DataType.STRING(20)) declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'owner_user_id' })
  declare ownerUserId: string | null;

  @Column({ type: DataType.DATE, field: 'created_at' }) declare createdAt: Date;
  @Column({ type: DataType.DATE, field: 'updated_at' }) declare updatedAt: Date;

  @BelongsTo(() => InternalUserModel)
  declare owner?: InternalUserModel;
}

/** Se registra aparte de `atlasSalesModels`, como el motor de calificacion. */
export const crmSegmentModels = [CrmSegmentModel];
