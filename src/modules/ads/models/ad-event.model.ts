import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasOne,
  Model,
  Table,
} from 'sequelize-typescript';
import { DeliveryDecisionModel } from './delivery-decision.model';
import { AdvertiserAccountModel } from './advertiser-account.model';
import { CampaignModel } from './campaign.model';
import { AdSetModel } from './ad-set.model';
import { AdModel } from './ad.model';
import { InventoryPlacementModel } from './inventory-placement.model';
import { SpendLedgerModel } from './spend-ledger.model';

/**
 * `event_time` es DATO DE NEGOCIO, no la marca de creación de la fila.
 *
 * Estaba declarado como `createdAt` de Sequelize, y de ahí venía que el momento declarado por quien
 * sirvió el anuncio no se pudiera escribir: Sequelize gestiona esa columna por su cuenta. Con
 * envíos de uno en uno la diferencia era de milisegundos; con `POST /ads/events/bulk` —que existe
 * para mandar la jornada en lote— toda la jornada quedaba fechada en el instante de la ingesta, y
 * `ad_daily_metrics`, que agrega por `event_time::date`, resumía el mes entero en un solo día.
 */
@Table({ tableName: 'ad_events', timestamps: false })
export class AdEventModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({
    field: 'event_time',
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare eventTime: Date;
  @Column({ field: 'event_type', type: DataType.STRING(30), allowNull: false })
  declare eventType: string;
  @Column({ field: 'request_id', type: DataType.UUID, allowNull: true }) declare requestId:
    string | null;
  @ForeignKey(() => DeliveryDecisionModel)
  @Column({ field: 'delivery_decision_id', type: DataType.UUID, allowNull: true })
  declare deliveryDecisionId: string | null;
  @ForeignKey(() => AdvertiserAccountModel)
  @Column({ field: 'advertiser_id', type: DataType.UUID, allowNull: false })
  declare advertiserId: string;
  @ForeignKey(() => CampaignModel)
  @Column({ field: 'campaign_id', type: DataType.UUID, allowNull: false })
  declare campaignId: string;
  @ForeignKey(() => AdSetModel)
  @Column({ field: 'ad_set_id', type: DataType.UUID, allowNull: false })
  declare adSetId: string;
  @ForeignKey(() => AdModel)
  @Column({ field: 'ad_id', type: DataType.UUID, allowNull: false })
  declare adId: string;
  @ForeignKey(() => InventoryPlacementModel)
  @Column({ field: 'placement_id', type: DataType.UUID, allowNull: true })
  declare placementId: string | null;
  @Column({ field: 'corporate_client_hash', type: DataType.STRING(128), allowNull: true })
  declare corporateClientHash: string | null;
  @Column({ field: 'session_hash', type: DataType.STRING(128), allowNull: true })
  declare sessionHash: string | null;
  @Column({ field: 'ip_hash', type: DataType.STRING(128), allowNull: true }) declare ipHash:
    string | null;
  @Column({ field: 'user_agent_hash', type: DataType.STRING(128), allowNull: true })
  declare userAgentHash: string | null;
  @Column({ field: 'cost_micros', type: DataType.BIGINT, allowNull: false, defaultValue: 0 })
  declare costMicros: number;
  @Column({ field: 'is_billable', type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isBillable: boolean;
  @Column({ field: 'fraud_score', type: DataType.DECIMAL(5, 4), allowNull: true })
  declare fraudScore: string | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} }) declare metadata: Record<
    string,
    unknown
  >;
  @BelongsTo(() => DeliveryDecisionModel, 'delivery_decision_id')
  declare deliveryDecision?: DeliveryDecisionModel;
  @BelongsTo(() => AdvertiserAccountModel, 'advertiser_id')
  declare advertiser?: AdvertiserAccountModel;
  @BelongsTo(() => CampaignModel, 'campaign_id') declare campaign?: CampaignModel;
  @BelongsTo(() => AdSetModel, 'ad_set_id') declare adSet?: AdSetModel;
  @BelongsTo(() => AdModel, 'ad_id') declare ad?: AdModel;
  @BelongsTo(() => InventoryPlacementModel, 'placement_id')
  declare placement?: InventoryPlacementModel;
  @HasOne(() => SpendLedgerModel, 'ad_event_id') declare spendLedgerEntry?: SpendLedgerModel;
}
