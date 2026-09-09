import {
  AllowNull,
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import {
  AccountLifecycleStatus,
  AccountType,
  BillingTiming,
  ContractStatus,
  InvoiceStatus,
  PayableStatus,
  ReceivableStatus,
  RecoveryStatus,
  SALES_SCHEMA,
  TermType,
} from '../b2b-sales-crm.enums';

@Table({ schema: SALES_SCHEMA, tableName: 'internal_users', timestamps: false })
export class InternalUserModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(180), field: 'full_name' })
  declare fullName: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(180))
  declare email: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(80), field: 'role_code' })
  declare roleCode: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, field: 'is_active' })
  declare isActive: boolean;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'territories', timestamps: false })
export class TerritoryModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare name: string;

  @Column(DataType.STRING(120))
  declare city: string | null;

  @Column(DataType.STRING(120))
  declare region: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, field: 'is_active' })
  declare isActive: boolean;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'b2b_accounts', timestamps: false })
export class B2BAccountModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  // Unificación con contabilidad: business partner facturable (atlas_accounting.business_partner).
  @Column({ type: DataType.UUID, field: 'business_partner_id' })
  declare businessPartnerId: string | null;

  /* El expediente del comercio en AtlasBackend (`partner_profiles._id`). Opaco; nulo sin enlazar. */
  @Column({ type: DataType.STRING(64), field: 'partner_profile_id' })
  declare partnerProfileId: string | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(220), field: 'legal_name' })
  declare legalName: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(220), field: 'trade_name' })
  declare tradeName: string;

  @Unique
  @Column({ type: DataType.STRING(60), field: 'tax_id' })
  declare taxId: string | null;

  @AllowNull(false)
  @Default(AccountType.MERCHANT)
  @Column({ type: DataType.ENUM(...Object.values(AccountType)), field: 'account_type' })
  declare accountType: AccountType;

  @Column(DataType.STRING(120))
  declare industry: string | null;

  @AllowNull(false) @Column(DataType.STRING(120)) declare category: string;
  @AllowNull(false)
  @Column({ type: DataType.STRING(160), field: 'business_line' })
  declare businessLine: string;
  @Column({ type: DataType.TEXT, field: 'business_description' }) declare businessDescription:
    string | null;
  @Column({ type: DataType.STRING(500), field: 'website_url' }) declare websiteUrl: string | null;
  @AllowNull(false)
  @Default('BO')
  @Column({ type: DataType.STRING(2), field: 'country_code' })
  declare countryCode: string;
  @Column(DataType.STRING(120)) declare city: string | null;
  @Column(DataType.STRING(500)) declare address: string | null;
  @Column({ type: DataType.INTEGER, field: 'employee_count' }) declare employeeCount: number | null;
  @Column({ type: DataType.INTEGER, field: 'founded_year' }) declare foundedYear: number | null;
  @Column({ type: DataType.DECIMAL(18, 2), field: 'annual_revenue' }) declare annualRevenue:
    string | null;

  @Index
  @AllowNull(false)
  @Default(AccountLifecycleStatus.LEAD)
  @Column({
    type: DataType.ENUM(...Object.values(AccountLifecycleStatus)),
    field: 'lifecycle_status',
  })
  declare lifecycleStatus: AccountLifecycleStatus;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'owner_user_id' })
  declare ownerUserId: string | null;

  @ForeignKey(() => TerritoryModel)
  @Column({ type: DataType.UUID, field: 'territory_id' })
  declare territoryId: string | null;

  /** Juicio COMERCIAL que carga un ejecutivo al alta. Texto libre, no lo escribe el motor. */
  @Column({ type: DataType.STRING(30), field: 'risk_tier' })
  declare riskTier: string | null;

  /**
   * Categoría CALCULADA sobre la mora real de sus cuentas por cobrar (A–F).
   *
   * Es una proyección de `b2b_account_risk_ratings` para que listar el CRM no exija un join por
   * fila; la fuente de verdad —con su historial y la política que la produjo— es esa tabla. Va
   * aparte de `risk_tier` a propósito: son dos juicios distintos, y pisar uno con otro dejaría a
   * nadie capaz de decir cuál está viendo.
   */
  @Column({ type: DataType.STRING(4), field: 'risk_rating_grade' })
  declare riskRatingGrade: string | null;

  @Column({ type: DataType.DATE, field: 'risk_rating_updated_at' })
  declare riskRatingUpdatedAt: Date | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'expected_monthly_volume' })
  declare expectedMonthlyVolume: string | null;

  @Column(DataType.TEXT)
  declare notes: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;

  /** Archivado (soft-delete reversible): con fecha, la cuenta sale de los listados operativos. */
  @Index
  @Column({ type: DataType.DATE, field: 'archived_at' })
  declare archivedAt: Date | null;

  @BelongsTo(() => InternalUserModel)
  declare owner?: InternalUserModel;

  @BelongsTo(() => TerritoryModel)
  declare territory?: TerritoryModel;

  @HasMany(() => B2BContactModel)
  declare contacts?: B2BContactModel[];

  @BelongsToMany(() => AccountTagModel, () => B2BAccountTagModel)
  declare tags?: AccountTagModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'account_tags', timestamps: false })
export class AccountTagModel extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;
  @Unique @AllowNull(false) @Column(DataType.STRING(80)) declare name: string;
  @Column(DataType.STRING(200)) declare description: string | null;
  @Default(true) @Column({ type: DataType.BOOLEAN, field: 'is_active' }) declare isActive: boolean;
  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'b2b_account_tags', timestamps: false })
export class B2BAccountTagModel extends Model {
  @PrimaryKey
  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;
  @PrimaryKey
  @ForeignKey(() => AccountTagModel)
  @Column({ type: DataType.UUID, field: 'tag_id' })
  declare tagId: string;
  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'b2b_contacts', timestamps: false })
export class B2BContactModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(180), field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.STRING(120), field: 'role_title' })
  declare roleTitle: string | null;

  @Column(DataType.STRING(180))
  declare email: string | null;

  @Column(DataType.STRING(60))
  declare phone: string | null;

  @Column({ type: DataType.STRING(60), field: 'decision_role' })
  declare decisionRole: string | null;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, field: 'is_primary' })
  declare isPrimary: boolean;

  @Default('ACTIVE')
  @Column(DataType.STRING(30))
  declare status: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @BelongsTo(() => B2BAccountModel)
  declare account?: B2BAccountModel;
}

@Table({ schema: SALES_SCHEMA, tableName: 'sales_opportunities', timestamps: false })
export class SalesOpportunityModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => InternalUserModel)
  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'owner_user_id' })
  declare ownerUserId: string;

  @AllowNull(false)
  @Column(DataType.STRING(220))
  declare name: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(40), field: 'opportunity_type' })
  declare opportunityType: string;

  @Default('DISCOVERY')
  @Column(DataType.STRING(40))
  declare stage: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'expected_monthly_volume' })
  declare expectedMonthlyVolume: string | null;

  @Column({ type: DataType.DECIMAL(9, 6), field: 'expected_mdr_rate' })
  declare expectedMdrRate: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'expected_monthly_revenue' })
  declare expectedMonthlyRevenue: string | null;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  declare probability: string;

  @Column({ type: DataType.DATEONLY, field: 'expected_close_date' })
  declare expectedCloseDate: string | null;

  @Column({ type: DataType.STRING(220), field: 'loss_reason' })
  declare lossReason: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;

  @BelongsTo(() => B2BAccountModel)
  declare account?: B2BAccountModel;
}

@Table({ schema: SALES_SCHEMA, tableName: 'commercial_activities', timestamps: false })
export class CommercialActivityModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => SalesOpportunityModel)
  @Column({ type: DataType.UUID, field: 'opportunity_id' })
  declare opportunityId: string | null;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'owner_user_id' })
  declare ownerUserId: string;

  @Column({ type: DataType.STRING(50), field: 'activity_type' })
  declare activityType: string;

  @Column(DataType.STRING(220))
  declare subject: string;

  @Column(DataType.TEXT)
  declare description: string | null;

  @Column({ type: DataType.DATE, field: 'due_at' })
  declare dueAt: Date | null;

  @Column({ type: DataType.DATE, field: 'completed_at' })
  declare completedAt: Date | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'commercial_proposals', timestamps: false })
export class CommercialProposalModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => SalesOpportunityModel)
  @Column({ type: DataType.UUID, field: 'opportunity_id' })
  declare opportunityId: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @Unique
  @Column({ type: DataType.STRING(80), field: 'proposal_number' })
  declare proposalNumber: string;

  @Default('DRAFT')
  @Column(DataType.STRING(40))
  declare status: string;

  @Column({ type: DataType.DATEONLY, field: 'valid_until' })
  declare validUntil: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'total_estimated_monthly_revenue' })
  declare totalEstimatedMonthlyRevenue: string | null;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'created_by_user_id' })
  declare createdByUserId: string;

  @Column({ type: DataType.DATE, field: 'sent_at' })
  declare sentAt: Date | null;

  @Column({ type: DataType.DATE, field: 'accepted_at' })
  declare acceptedAt: Date | null;

  @Column({ type: DataType.DATE, field: 'rejected_at' })
  declare rejectedAt: Date | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  /* La cuenta, para poder listar por el NOMBRE del comercio y no por su uuid. */
  @BelongsTo(() => B2BAccountModel)
  declare account?: B2BAccountModel;

  @HasMany(() => ProposalLineModel)
  declare lines?: ProposalLineModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'proposal_lines', timestamps: false })
export class ProposalLineModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => CommercialProposalModel)
  @Column({ type: DataType.UUID, field: 'proposal_id' })
  declare proposalId: string;

  @Column({ type: DataType.ENUM(...Object.values(TermType)), field: 'term_type' })
  declare termType: TermType;

  @Column(DataType.STRING(240))
  declare description: string;

  @Column({ type: DataType.DECIMAL(9, 6), field: 'rate_percent' })
  declare ratePercent: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'fixed_amount' })
  declare fixedAmount: string | null;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.ENUM(...Object.values(BillingTiming)), field: 'billing_timing' })
  declare billingTiming: BillingTiming;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'minimum_monthly_amount' })
  declare minimumMonthlyAmount: string | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'approval_requests', timestamps: false })
export class ApprovalRequestModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => CommercialProposalModel)
  @Column({ type: DataType.UUID, field: 'proposal_id' })
  declare proposalId: string | null;

  @Column({ type: DataType.UUID, field: 'contract_version_id' })
  declare contractVersionId: string | null;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'requested_by_user_id' })
  declare requestedByUserId: string;

  @Column({ type: DataType.STRING(80), field: 'approval_type' })
  declare approvalType: string;

  @Column(DataType.TEXT)
  declare reason: string;

  @Default('PENDING')
  @Column(DataType.STRING(40))
  declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'approved_by_user_id' })
  declare approvedByUserId: string | null;

  @Column({ type: DataType.DATE, field: 'decided_at' })
  declare decidedAt: Date | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'b2b_contracts', timestamps: false })
export class B2BContractModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => SalesOpportunityModel)
  @Column({ type: DataType.UUID, field: 'opportunity_id' })
  declare opportunityId: string | null;

  @Unique
  @Column({ type: DataType.STRING(80), field: 'contract_number' })
  declare contractNumber: string;

  @Default(ContractStatus.DRAFT)
  @Column({ type: DataType.ENUM(...Object.values(ContractStatus)) })
  declare status: ContractStatus;

  @Column({ type: DataType.DATEONLY, field: 'start_date' })
  declare startDate: string | null;

  @Column({ type: DataType.DATEONLY, field: 'end_date' })
  declare endDate: string | null;

  @Default('MONTHLY')
  @Column({ type: DataType.STRING(40), field: 'billing_cycle' })
  declare billingCycle: string;

  @Default('PER_CONTRACT')
  @Column({ type: DataType.STRING(80), field: 'settlement_policy' })
  declare settlementPolicy: string;

  @Column({ type: DataType.DATE, field: 'signed_at' })
  declare signedAt: Date | null;

  @Column({ type: DataType.DATE, field: 'terminated_at' })
  declare terminatedAt: Date | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  /* La cuenta, para poder listar por el NOMBRE del comercio y no por su uuid. */
  @BelongsTo(() => B2BAccountModel)
  declare account?: B2BAccountModel;

  @HasMany(() => ContractVersionModel)
  declare versions?: ContractVersionModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'contract_versions', timestamps: false })
export class ContractVersionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BContractModel)
  @Column({ type: DataType.UUID, field: 'contract_id' })
  declare contractId: string;

  @Column({ type: DataType.INTEGER, field: 'version_number' })
  declare versionNumber: number;

  @Column({ type: DataType.DATEONLY, field: 'valid_from' })
  declare validFrom: string;

  @Column({ type: DataType.DATEONLY, field: 'valid_to' })
  declare validTo: string | null;

  @Default('DRAFT')
  @Column(DataType.STRING(40))
  declare status: string;

  @Column({ type: DataType.TEXT, field: 'document_url' })
  declare documentUrl: string | null;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'approved_by_user_id' })
  declare approvedByUserId: string | null;

  @Column({ type: DataType.DATE, field: 'approved_at' })
  declare approvedAt: Date | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @BelongsTo(() => B2BContractModel)
  declare contract?: B2BContractModel;

  @HasMany(() => CommercialTermModel)
  declare terms?: CommercialTermModel[];

  @HasMany(() => MDRRuleModel)
  declare mdrRules?: MDRRuleModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'commercial_terms', timestamps: false })
export class CommercialTermModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => ContractVersionModel)
  @Column({ type: DataType.UUID, field: 'contract_version_id' })
  declare contractVersionId: string;

  @Column({ type: DataType.ENUM(...Object.values(TermType)), field: 'term_type' })
  declare termType: TermType;

  @Column(DataType.STRING(240))
  declare description: string | null;

  @Column({ type: DataType.DECIMAL(9, 6), field: 'rate_percent' })
  declare ratePercent: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'fixed_amount' })
  declare fixedAmount: string | null;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.ENUM(...Object.values(BillingTiming)), field: 'billing_timing' })
  declare billingTiming: BillingTiming;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'min_amount' })
  declare minAmount: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'max_amount' })
  declare maxAmount: string | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'mdr_rules', timestamps: false })
export class MDRRuleModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => ContractVersionModel)
  @Column({ type: DataType.UUID, field: 'contract_version_id' })
  declare contractVersionId: string;

  @Column({ type: DataType.STRING(120), field: 'product_category' })
  declare productCategory: string | null;

  @ForeignKey(() => MerchantBranchModel)
  @Column({ type: DataType.UUID, field: 'branch_id' })
  declare branchId: string | null;

  @Column({ type: DataType.STRING(60), field: 'risk_segment' })
  declare riskSegment: string | null;

  @Column({ type: DataType.DECIMAL(9, 6), field: 'rate_percent' })
  declare ratePercent: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'min_fee_amount' })
  declare minFeeAmount: string | null;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'max_fee_amount' })
  declare maxFeeAmount: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, field: 'is_active' })
  declare isActive: boolean;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_branches', timestamps: false })
export class MerchantBranchModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @Column(DataType.STRING(160))
  declare name: string;

  @Column(DataType.STRING(120))
  declare city: string | null;

  @Column(DataType.TEXT)
  declare address: string | null;

  @Default('PENDING')
  @Column(DataType.STRING(40))
  declare status: string;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, field: 'can_originate_bnpl' })
  declare canOriginateBnpl: boolean;

  @Column({ type: DataType.DATE, field: 'activated_at' })
  declare activatedAt: Date | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_users', timestamps: false })
export class MerchantUserModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => MerchantBranchModel)
  @Column({ type: DataType.UUID, field: 'branch_id' })
  declare branchId: string | null;

  // Identidad del usuario en AtlasBackend (`sub` del JWT). Es el enlace preferente para resolver
  // el alcance del portal del comercio; `emailNormalized` es el enlace de respaldo.
  //
  // Texto, no UUID: el identificador del proveedor de identidad es opaco. AtlasBackend emite
  // bigints y declararlo `uuid` dejaba el enlace preferente inservible sin que nada fallara.
  @Column({ type: DataType.STRING(64), field: 'user_id' })
  declare userId: string | null;

  @Column(DataType.STRING(180))
  declare email: string;

  // Columna generada por PostgreSQL: lower(btrim(email)). Solo lectura.
  @Column({ type: DataType.STRING(180), field: 'email_normalized' })
  declare emailNormalized: string;

  @Column({ type: DataType.STRING(180), field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.STRING(80), field: 'role_code' })
  declare roleCode: string;

  @Default('ACTIVE')
  @Column(DataType.STRING(40))
  declare status: string;

  // La petición de alta de identidad encolada en AtlasBackend. Texto, por lo mismo que `userId`:
  // el identificador del otro lado es opaco (bigints allí, uuid en las fixtures de aquí).
  @Column({ type: DataType.STRING(120), field: 'identity_request_id' })
  declare identityRequestId: string | null;

  /* Por qué Atlas rechazó el acceso pedido. Nulo si no se rechazó (migración 20260909100000). */
  @Column({ type: DataType.STRING(240), field: 'identity_rejection_reason' })
  declare identityRejectionReason: string | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_onboarding_cases', timestamps: false })
export class MerchantOnboardingCaseModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'owner_user_id' })
  declare ownerUserId: string;

  @Default('OPEN')
  @Column(DataType.STRING(40))
  declare status: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'started_at' })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, field: 'completed_at' })
  declare completedAt: Date | null;

  /*
   * La posición del caso en la cadena ERP → Motor → Portal → ERP (migración 20260908120000).
   * El contrato pactado para el alta; nulo = la activación usa la versión activa de la cuenta.
   */
  @ForeignKey(() => ContractVersionModel)
  @Column({ type: DataType.UUID, field: 'contract_version_id' })
  declare contractVersionId: string | null;

  /* Lo que devolvió el Motor (vía AtlasBackend). Opacos: no se interpretan aquí. */
  @Column({ type: DataType.STRING(120), field: 'decision_execution_id' })
  declare decisionExecutionId: string | null;

  @Column({ type: DataType.STRING(40), field: 'decision_outcome' })
  declare decisionOutcome: string | null;

  @Column({ type: DataType.STRING(240), field: 'decision_reason' })
  declare decisionReason: string | null;

  @Column({ type: DataType.STRING(120), field: 'decision_artifact_version' })
  declare decisionArtifactVersion: string | null;

  @Column({ type: DataType.STRING(120), field: 'manual_review_case_code' })
  declare manualReviewCaseCode: string | null;

  @Column({ type: DataType.DATE, field: 'decided_at' })
  declare decidedAt: Date | null;

  /* Cuándo el ERP acusó que el portal concedió las credenciales. */
  @Column({ type: DataType.DATE, field: 'identity_acknowledged_at' })
  declare identityAcknowledgedAt: Date | null;

  /* La cuenta, para poder listar los casos por el NOMBRE del comercio y no por su uuid. */
  @BelongsTo(() => B2BAccountModel)
  declare account?: B2BAccountModel;

  @BelongsTo(() => ContractVersionModel)
  declare contractVersion?: ContractVersionModel;

  @HasMany(() => OnboardingChecklistItemModel)
  declare checklistItems?: OnboardingChecklistItemModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'onboarding_checklist_items', timestamps: false })
export class OnboardingChecklistItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => MerchantOnboardingCaseModel)
  @Column({ type: DataType.UUID, field: 'onboarding_case_id' })
  declare onboardingCaseId: string;

  @Column({ type: DataType.STRING(80), field: 'item_type' })
  declare itemType: string;

  @Column(DataType.STRING(260))
  declare description: string;

  @Default('PENDING')
  @Column(DataType.STRING(40))
  declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'completed_by_user_id' })
  declare completedByUserId: string | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'consumers_ref', timestamps: false })
export class ConsumerRefModel extends Model {
  /* Sin `@Default` la fila nacia sin id y el INSERT moria: el cliente nuevo no se podia crear. */
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.STRING(120), field: 'external_ref' })
  declare externalRef: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'bnpl_purchases', timestamps: false })
export class BNPLPurchaseModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'merchant_account_id' })
  declare merchantAccountId: string;

  @ForeignKey(() => MerchantBranchModel)
  @Column({ type: DataType.UUID, field: 'branch_id' })
  declare branchId: string | null;

  @ForeignKey(() => ConsumerRefModel)
  @Column({ type: DataType.UUID, field: 'consumer_id' })
  declare consumerId: string;

  @ForeignKey(() => ContractVersionModel)
  @Column({ type: DataType.UUID, field: 'contract_version_id' })
  declare contractVersionId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'purchase_amount' })
  declare purchaseAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'down_payment_amount' })
  declare downPaymentAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'financed_amount' })
  declare financedAmount: string;

  @Column({ type: DataType.STRING(60), field: 'risk_tier_at_origination' })
  declare riskTierAtOrigination: string | null;

  @Column({ type: DataType.STRING(80), field: 'cohort_id' })
  declare cohortId: string | null;

  @Default('PENDING')
  @Column(DataType.STRING(40))
  declare status: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'purchase_date' })
  declare purchaseDate: Date;

  @HasMany(() => BNPLInstallmentModel)
  declare installments?: BNPLInstallmentModel[];

  @HasMany(() => ConsumerPaymentToMerchantModel)
  declare consumerPaymentsToMerchant?: ConsumerPaymentToMerchantModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'bnpl_installments', timestamps: false })
export class BNPLInstallmentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => BNPLPurchaseModel)
  @Column({ type: DataType.UUID, field: 'purchase_id' })
  declare purchaseId: string;

  @Column({ type: DataType.INTEGER, field: 'installment_number' })
  declare installmentNumber: number;

  @Column({ type: DataType.DATEONLY, field: 'due_date' })
  declare dueDate: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Default('SCHEDULED')
  @Column(DataType.STRING(40))
  declare status: string;

  @Column({ type: DataType.DATE, field: 'paid_to_merchant_at' })
  declare paidToMerchantAt: Date | null;

  @BelongsTo(() => BNPLPurchaseModel)
  declare purchase?: BNPLPurchaseModel;
}

@Table({ schema: SALES_SCHEMA, tableName: 'consumer_payments_to_merchant', timestamps: false })
export class ConsumerPaymentToMerchantModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => BNPLPurchaseModel)
  @Column({ type: DataType.UUID, field: 'purchase_id' })
  declare purchaseId: string;

  @ForeignKey(() => BNPLInstallmentModel)
  @Column({ type: DataType.UUID, field: 'installment_id' })
  declare installmentId: string | null;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Column({ type: DataType.DATE, field: 'paid_at' })
  declare paidAt: Date;

  @Column({ type: DataType.TEXT, field: 'evidence_ref' })
  declare evidenceRef: string | null;

  @Default('REPORTED')
  @Column(DataType.STRING(40))
  declare status: string;

  @BelongsTo(() => BNPLPurchaseModel)
  declare purchase?: BNPLPurchaseModel;

  @BelongsTo(() => BNPLInstallmentModel)
  declare installment?: BNPLInstallmentModel;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_invoices', timestamps: false })
export class MerchantInvoiceModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => B2BContractModel)
  @Column({ type: DataType.UUID, field: 'contract_id' })
  declare contractId: string | null;

  @Unique
  @Column({ type: DataType.STRING(80), field: 'invoice_number' })
  declare invoiceNumber: string;

  @Column({ type: DataType.DATEONLY, field: 'invoice_date' })
  declare invoiceDate: string;

  @Column({ type: DataType.DATEONLY, field: 'due_date' })
  declare dueDate: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'subtotal_amount' })
  declare subtotalAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'tax_amount' })
  declare taxAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'total_amount' })
  declare totalAmount: string;

  @Default(InvoiceStatus.DRAFT)
  @Column({ type: DataType.ENUM(...Object.values(InvoiceStatus)) })
  declare status: InvoiceStatus;

  @Column({ type: DataType.STRING(180), field: 'external_tax_ref' })
  declare externalTaxRef: string | null;

  // Puente a contabilidad: documento contable generado al postear la factura al mayor.
  @Column({ type: DataType.UUID, field: 'accounting_document_id' })
  declare accountingDocumentId: string | null;

  @HasMany(() => MerchantInvoiceLineModel)
  declare lines?: MerchantInvoiceLineModel[];
}

/**
 * Catalogo de lo que Atlas le factura al comercio.
 *
 * El producto es la cosa vendida —codigo, unidad de cobro, cuenta de ingreso—; el PRECIO por
 * unidad no esta aqui, esta en el plan contratado (`MerchantPlanModel.cpmMicros` / `cpcMicros`),
 * porque es lo que se negocia con cada comercio. `sourceType` es la clave con la que se reconocen
 * los cargos y las lineas de factura anteriores al catalogo.
 */
@Table({ schema: SALES_SCHEMA, tableName: 'billing_products', timestamps: false })
export class BillingProductModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(40))
  declare code: string;

  @AllowNull(false)
  @Column(DataType.STRING(140))
  declare name: string;

  @Column(DataType.TEXT)
  declare description: string | null;

  /** CPM | CPC | MDR | FIXED. Decide de que columna del plan sale el precio unitario. */
  @AllowNull(false)
  @Column({ type: DataType.STRING(20), field: 'charge_basis' })
  declare chargeBasis: string;

  @Unique
  @AllowNull(false)
  @Column({ type: DataType.STRING(80), field: 'source_type' })
  declare sourceType: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(80), field: 'unit_label' })
  declare unitLabel: string;

  /** Numero de cuenta contable de ingreso, no su uuid: la cuenta es por entidad legal. */
  @Column({ type: DataType.STRING(40), field: 'revenue_gl_account_code' })
  declare revenueGlAccountCode: string | null;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Default('ACTIVE')
  @Column(DataType.STRING(20))
  declare status: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, field: 'sort_order' })
  declare sortOrder: number;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_invoice_lines', timestamps: false })
export class MerchantInvoiceLineModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => MerchantInvoiceModel)
  @Column({ type: DataType.UUID, field: 'invoice_id' })
  declare invoiceId: string;

  @Column({ type: DataType.STRING(80), field: 'source_type' })
  declare sourceType: string;

  @Column({ type: DataType.UUID, field: 'source_id' })
  declare sourceId: string | null;

  /** Producto facturado. `sourceType` sigue siendo la clave de lo emitido antes del catalogo. */
  @ForeignKey(() => BillingProductModel)
  @Column({ type: DataType.UUID, field: 'product_id' })
  declare productId: string | null;

  @BelongsTo(() => BillingProductModel)
  declare product?: BillingProductModel;

  @Column(DataType.STRING(260))
  declare description: string;

  @Default(1)
  @Column(DataType.DECIMAL(18, 4))
  declare quantity: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'unit_amount' })
  declare unitAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'tax_amount' })
  declare taxAmount: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'total_amount' })
  declare totalAmount: string;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_receivables', timestamps: false })
export class MerchantReceivableModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => MerchantInvoiceModel)
  @Column({ type: DataType.UUID, field: 'invoice_id' })
  declare invoiceId: string | null;

  @Column({ type: DataType.STRING(80), field: 'source_type' })
  declare sourceType: string;

  @Column({ type: DataType.UUID, field: 'source_id' })
  declare sourceId: string | null;

  /** Producto que origina el cargo; nulo solo en lo cargado antes de existir el catalogo. */
  @ForeignKey(() => BillingProductModel)
  @Column({ type: DataType.UUID, field: 'product_id' })
  declare productId: string | null;

  @BelongsTo(() => BillingProductModel)
  declare product?: BillingProductModel;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_original' })
  declare amountOriginal: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_open' })
  declare amountOpen: string;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'issued_at' })
  declare issuedAt: Date;

  @Column({ type: DataType.DATEONLY, field: 'due_date' })
  declare dueDate: string;

  @Default(ReceivableStatus.PENDING)
  @Column({ type: DataType.ENUM(...Object.values(ReceivableStatus)) })
  declare status: ReceivableStatus;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_payments', timestamps: false })
export class MerchantPaymentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.DATE, field: 'paid_at' })
  declare paidAt: Date;

  @Column({ type: DataType.STRING(80), field: 'payment_method' })
  declare paymentMethod: string | null;

  @Column({ type: DataType.STRING(180), field: 'external_ref' })
  declare externalRef: string | null;

  @Default('CONFIRMED')
  @Column(DataType.STRING(40))
  declare status: string;

  @HasMany(() => MerchantPaymentAllocationModel)
  declare allocations?: MerchantPaymentAllocationModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_payment_allocations', timestamps: false })
export class MerchantPaymentAllocationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => MerchantPaymentModel)
  @Column({ type: DataType.UUID, field: 'payment_id' })
  declare paymentId: string;

  @ForeignKey(() => MerchantReceivableModel)
  @Column({ type: DataType.UUID, field: 'receivable_id' })
  declare receivableId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_applied' })
  declare amountApplied: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'applied_at' })
  declare appliedAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_credit_notes', timestamps: false })
export class MerchantCreditNoteModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => MerchantInvoiceModel)
  @Column({ type: DataType.UUID, field: 'invoice_id' })
  declare invoiceId: string | null;

  @Unique
  @Column({ type: DataType.STRING(80), field: 'credit_note_number' })
  declare creditNoteNumber: string;

  @Column(DataType.STRING(240))
  declare reason: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Default('ISSUED')
  @Column(DataType.STRING(40))
  declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'approved_by_user_id' })
  declare approvedByUserId: string | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_payables', timestamps: false })
export class MerchantPayableModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string;

  @ForeignKey(() => BNPLPurchaseModel)
  @Column({ type: DataType.UUID, field: 'purchase_id' })
  declare purchaseId: string;

  @ForeignKey(() => BNPLInstallmentModel)
  @Column({ type: DataType.UUID, field: 'installment_id' })
  declare installmentId: string;

  @Default('CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE')
  @Column(DataType.STRING(80))
  declare reason: string;

  @Column(DataType.DECIMAL(18, 2))
  declare amount: string;

  @Column({ type: DataType.DATEONLY, field: 'scheduled_payment_date' })
  declare scheduledPaymentDate: string;

  @Column({ type: DataType.DATE, field: 'paid_at' })
  declare paidAt: Date | null;

  @Default(PayableStatus.SCHEDULED)
  @Column({ type: DataType.ENUM(...Object.values(PayableStatus)) })
  declare status: PayableStatus;

  @BelongsTo(() => BNPLPurchaseModel)
  declare purchase?: BNPLPurchaseModel;

  @BelongsTo(() => BNPLInstallmentModel)
  declare installment?: BNPLInstallmentModel;
}

@Table({ schema: SALES_SCHEMA, tableName: 'consumer_recovery_receivables', timestamps: false })
export class ConsumerRecoveryReceivableModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => ConsumerRefModel)
  @Column({ type: DataType.UUID, field: 'consumer_id' })
  declare consumerId: string;

  @ForeignKey(() => BNPLPurchaseModel)
  @Column({ type: DataType.UUID, field: 'purchase_id' })
  declare purchaseId: string;

  @ForeignKey(() => BNPLInstallmentModel)
  @Column({ type: DataType.UUID, field: 'installment_id' })
  declare installmentId: string;

  @ForeignKey(() => MerchantPayableModel)
  @Unique
  @Column({ type: DataType.UUID, field: 'merchant_payable_id' })
  declare merchantPayableId: string;

  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_covered_by_atlas' })
  declare amountCoveredByAtlas: string;

  @Default(0)
  @Column({ type: DataType.DECIMAL(18, 2), field: 'amount_recovered' })
  declare amountRecovered: string;

  @Column({ type: DataType.DATE, field: 'coverage_paid_at' })
  declare coveragePaidAt: Date | null;

  @Default(RecoveryStatus.OPEN)
  @Column({ type: DataType.ENUM(...Object.values(RecoveryStatus)), field: 'recovery_status' })
  declare recoveryStatus: RecoveryStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, field: 'days_past_due' })
  declare daysPastDue: number;
}

@Table({ schema: SALES_SCHEMA, tableName: 'reconciliation_runs', timestamps: false })
export class ReconciliationRunModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.DATEONLY, field: 'period_start' })
  declare periodStart: string;

  @Column({ type: DataType.DATEONLY, field: 'period_end' })
  declare periodEnd: string;

  @Default('RUNNING')
  @Column(DataType.STRING(40))
  declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'started_by_user_id' })
  declare startedByUserId: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'started_at' })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, field: 'completed_at' })
  declare completedAt: Date | null;

  @HasMany(() => ReconciliationItemModel)
  declare items?: ReconciliationItemModel[];
}

@Table({ schema: SALES_SCHEMA, tableName: 'reconciliation_items', timestamps: false })
export class ReconciliationItemModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => ReconciliationRunModel)
  @Column({ type: DataType.UUID, field: 'run_id' })
  declare runId: string;

  @Column({ type: DataType.STRING(80), field: 'item_type' })
  declare itemType: string;

  @Default('MEDIUM')
  @Column(DataType.STRING(40))
  declare severity: string;

  @ForeignKey(() => B2BAccountModel)
  @Column({ type: DataType.UUID, field: 'account_id' })
  declare accountId: string | null;

  @Column({ type: DataType.STRING(180), field: 'source_ref' })
  declare sourceRef: string | null;

  @Column(DataType.TEXT)
  declare description: string;

  @Default('OPEN')
  @Column(DataType.STRING(40))
  declare status: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'resolved_by_user_id' })
  declare resolvedByUserId: string | null;

  @Column({ type: DataType.DATE, field: 'resolved_at' })
  declare resolvedAt: Date | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'audit_logs', timestamps: false })
export class AuditLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.STRING(120), field: 'entity_name' })
  declare entityName: string;

  @Column({ type: DataType.UUID, field: 'entity_id' })
  declare entityId: string;

  @Column(DataType.STRING(80))
  declare action: string;

  @ForeignKey(() => InternalUserModel)
  @Column({ type: DataType.UUID, field: 'changed_by_user_id' })
  declare changedByUserId: string | null;

  @Column({ type: DataType.JSONB, field: 'old_values' })
  declare oldValues: Record<string, unknown> | null;

  @Column({ type: DataType.JSONB, field: 'new_values' })
  declare newValues: Record<string, unknown> | null;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_plans', timestamps: false })
export class MerchantPlanModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(40))
  declare code: string;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  declare name: string;

  @Column(DataType.TEXT)
  declare description: string | null;

  @Default('STANDARD')
  @Column(DataType.STRING(30))
  declare tier: string;

  /**
   * En desuso: el comercio ya no paga una cuota mensual, paga por alcance y por clics.
   *
   * Se mantiene en cero y sin borrar para no romper lo que aun la lee. Lo que distingue a un plan
   * de otro son `cpmMicros` y `cpcMicros`.
   */
  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.DECIMAL(18, 2), field: 'monthly_price' })
  declare monthlyPrice: string;

  /** Precio por cada 1.000 personas alcanzadas, en micros. */
  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.BIGINT, field: 'cpm_micros' })
  declare cpmMicros: string;

  /** Precio por clic, en micros. */
  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.BIGINT, field: 'cpc_micros' })
  declare cpcMicros: string;

  @Default('BOB')
  @Column(DataType.CHAR(3))
  declare currency: string;

  @Column({ type: DataType.JSONB, defaultValue: [] })
  declare features: unknown;

  @Default('ACTIVE')
  @Column(DataType.STRING(20))
  declare status: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, field: 'sort_order' })
  declare sortOrder: number;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}

@Table({ schema: SALES_SCHEMA, tableName: 'merchant_subscriptions', timestamps: false })
export class MerchantSubscriptionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => B2BAccountModel)
  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'merchant_account_id' })
  declare merchantAccountId: string;

  @ForeignKey(() => MerchantPlanModel)
  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'plan_id' })
  declare planId: string;

  @Default('ACTIVE')
  @Column(DataType.STRING(20))
  declare status: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, field: 'auto_renew' })
  declare autoRenew: boolean;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'started_at' })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, field: 'current_period_end' })
  declare currentPeriodEnd: Date | null;

  @Column({ type: DataType.UUID, field: 'selected_by_user_id' })
  declare selectedByUserId: string | null;

  // Cierre de la suscripción. La restricción `ck_merchant_subscriptions_ended_at` exige que toda
  // suscripción no ACTIVE tenga fecha de cierre, y que ninguna ACTIVE la tenga.
  @Column({ type: DataType.DATE, field: 'ended_at' })
  declare endedAt: Date | null;

  @Column({ type: DataType.UUID, field: 'ended_by_user_id' })
  declare endedByUserId: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;

  @BelongsTo(() => MerchantPlanModel)
  declare plan?: MerchantPlanModel;
}

export const atlasSalesModels = [
  InternalUserModel,
  TerritoryModel,
  B2BAccountModel,
  AccountTagModel,
  B2BAccountTagModel,
  B2BContactModel,
  SalesOpportunityModel,
  CommercialActivityModel,
  CommercialProposalModel,
  ProposalLineModel,
  ApprovalRequestModel,
  B2BContractModel,
  ContractVersionModel,
  CommercialTermModel,
  MDRRuleModel,
  MerchantBranchModel,
  MerchantUserModel,
  MerchantOnboardingCaseModel,
  OnboardingChecklistItemModel,
  ConsumerRefModel,
  BNPLPurchaseModel,
  BNPLInstallmentModel,
  ConsumerPaymentToMerchantModel,
  BillingProductModel,
  MerchantInvoiceModel,
  MerchantInvoiceLineModel,
  MerchantReceivableModel,
  MerchantPaymentModel,
  MerchantPaymentAllocationModel,
  MerchantCreditNoteModel,
  MerchantPayableModel,
  ConsumerRecoveryReceivableModel,
  ReconciliationRunModel,
  ReconciliationItemModel,
  AuditLogModel,
  MerchantPlanModel,
  MerchantSubscriptionModel,
];
