import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { env } from '../config/env';
import { resolveSequelizeSslOptions } from '../config/db-ssl';
import { createContextLogger } from '../common/logging/root-pino-logger';
import { accountingModels, businessAuditModels, filesModels } from './models';
import { atlasSalesModels } from '../modules/b2b-sales-crm/models/b2b-sales-crm.models';
import { crmSegmentModels } from '../modules/b2b-sales-crm/models/crm-segment.model';
import { creditRatingModels } from '../modules/b2b-sales-crm/models/credit-rating.models';
import { adsModels } from '../modules/ads/models';
import { DatabaseSeederService } from './database-seeder.service';

const sequelizeLogger = createContextLogger('Sequelize');
const integratedModels = [
  ...atlasSalesModels,
  /* Registrar el modelo en su módulo NO basta: `forFeature` inyecta, pero un modelo que no está
   * en esta lista nunca se ata a la conexión y falla en la primera consulta con «Model not
   * initialized», que se lee como un problema de la tabla y no del arranque. Es lo que tenía
   * apagado el motor de calificación de riesgo: sus cuatro modelos estaban en el módulo y no
   * aquí, así que los cinco endpoints de `/b2b/credit-rating` respondían 500 en la primera
   * consulta —no 404—, y el fallo parecía de la tabla. */
  ...crmSegmentModels,
  ...creditRatingModels,
  ...accountingModels,
  ...businessAuditModels,
  ...adsModels,
  ...filesModels,
];

/**
 * `search_path` de la conexión: los esquemas de este backend, en orden, y `public` al final.
 *
 * No todos los modelos declaran `schema:`. Los de ads no lo hacen, y sus migraciones SQL tampoco
 * califican las tablas —heredan el `search_path` activo cuando corren—, así que la única forma de
 * que `ad_email_messages` resuelva en runtime es que la conexión traiga los esquemas del producto.
 * Sin esto el proceso arrancaba y moría en el primer sondeo del worker de correo con un `42P01`
 * («relation does not exist») que parecía una migración faltante y no lo era: la tabla estaba, sólo
 * que nadie le había dicho al cliente dónde mirar.
 *
 * `public` va al FINAL y no al principio: es donde vive el tracking de migraciones y nada de
 * negocio, y ponerlo primero haría que cualquier tabla homónima que aparezca allí ganara sobre la
 * real sin que nada lo dijera.
 */
const SEARCH_PATH = ['atlas_sales', 'atlas_accounting', 'atlas_ads', 'atlas_audit', 'public'];

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      uri: env.DATABASE_URL,
      // Fusionado y NO dos `dialectOptions` seguidos: la segunda clave ganaría a la primera, y la
      // que se perdería sería el TLS. Un fallo así no da error — la conexión funciona, sin cifrar.
      dialectOptions: {
        ...(resolveSequelizeSslOptions(env)?.dialectOptions ?? {}),
        options: `-c search_path=${SEARCH_PATH.join(',')}`,
      },
      autoLoadModels: false,
      synchronize: false,
      models: integratedModels,
      logging:
        env.DB_LOGGING || env.NODE_ENV === 'development'
          ? (sql: string) => sequelizeLogger.debug({ sql }, 'Sequelize SQL statement')
          : false,
    }),
  ],
  providers: [DatabaseSeederService],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
