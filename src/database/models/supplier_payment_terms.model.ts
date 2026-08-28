import { Column, DataType, Default, Model, Table } from 'sequelize-typescript';

/**
 * Cómo se le paga a un proveedor, como dato y no como nota.
 *
 * Es histórica a propósito: una condición se renegocia, y las facturas ya
 * emitidas se pactaron con la anterior. Guardarla como columna del proveedor
 * reescribiría el pasado —una factura de hace seis meses pasaría a vencer con el
 * plazo de hoy— y la mora calculada dejaría de cuadrar con lo acordado.
 */
@Table({
  tableName: 'supplier_payment_terms',
  schema: 'atlas_accounting',
  timestamps: false,
  underscored: true,
})
export class SupplierPaymentTermsModel extends Model {
  @Column({
    type: DataType.UUID,
    field: 'id',
    primaryKey: true,
    allowNull: false,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.UUID, field: 'legal_entity_id', allowNull: false })
  declare legalEntityId: string;

  @Column({ type: DataType.UUID, field: 'supplier_bp_id', allowNull: false })
  declare supplierBpId: string;

  @Column({ type: DataType.STRING(40), field: 'code', allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(140), field: 'name', allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, field: 'description', allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.CHAR(3), field: 'currency_code', allowNull: false })
  declare currencyCode: string;

  @Column({ type: DataType.STRING(20), field: 'modality', allowNull: false })
  declare modality: string;

  @Column({ type: DataType.STRING(20), field: 'computation_base', allowNull: false })
  declare computationBase: string;

  @Column({ type: DataType.INTEGER, field: 'term_days', allowNull: false })
  declare termDays: number;

  @Column({ type: DataType.STRING(20), field: 'frequency', allowNull: false })
  declare frequency: string;

  @Column({ type: DataType.STRING(20), field: 'payment_method', allowNull: false })
  declare paymentMethod: string;

  @Column({ type: DataType.UUID, field: 'bp_bank_account_id', allowNull: true })
  declare bpBankAccountId: string | null;

  /** `NUMERIC` llega como string desde Postgres para no perder precisión. */
  @Column({ type: DataType.DECIMAL(5, 2), field: 'advance_percentage', allowNull: false })
  declare advancePercentage: string;

  @Column({ type: DataType.ARRAY(DataType.TEXT), field: 'withholding_codes', allowNull: false })
  declare withholdingCodes: string[];

  @Column({ type: DataType.DECIMAL(5, 2), field: 'early_payment_discount', allowNull: false })
  declare earlyPaymentDiscount: string;

  @Column({ type: DataType.TEXT, field: 'special_conditions', allowNull: true })
  declare specialConditions: string | null;

  @Column({ type: DataType.TEXT, field: 'notes', allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.STRING(20), field: 'status', allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATEONLY, field: 'valid_from', allowNull: false })
  declare validFrom: Date | string;

  /** `null` = vigente sin fecha de fin. */
  @Column({ type: DataType.DATEONLY, field: 'valid_to', allowNull: true })
  declare validTo: Date | string | null;

  @Column({ type: DataType.UUID, field: 'created_by', allowNull: true })
  declare createdBy: string | null;

  /*
   * Con `@Default`: un `allowNull: false` sin valor por defecto EN EL MODELO anula el `DEFAULT
   * now()` de la tabla, y el alta falla siempre con «createdAtValue cannot be null». No se había
   * visto porque hasta ahora nada escribía en esta tabla: el modelo existía sin servicio que lo
   * usara, y el fallo esperaba al primer alta real.
   */
  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at', allowNull: false })
  declare createdAtValue: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at', allowNull: false })
  declare updatedAtValue: Date;
}
