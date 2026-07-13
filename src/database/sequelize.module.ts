import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { env } from '../config/env';
import { createContextLogger } from '../common/logging/root-pino-logger';
import { accountingModels, businessAuditModels, filesModels } from './models';
import { atlasSalesModels } from '../modules/b2b-sales-crm/models/b2b-sales-crm.models';
import { adsModels } from '../modules/ads/models';
import { DatabaseSeederService } from './database-seeder.service';

const sequelizeLogger = createContextLogger('Sequelize');
const integratedModels = [
  ...atlasSalesModels,
  ...accountingModels,
  ...businessAuditModels,
  ...adsModels,
  ...filesModels,
];

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      uri: env.DATABASE_URL,
      ...(env.DB_SSL
        ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } }
        : {}),
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
