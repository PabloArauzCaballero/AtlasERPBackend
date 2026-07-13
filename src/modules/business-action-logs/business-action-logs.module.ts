import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BusinessActionLogModel } from '../../database/models';
import { BusinessActionLogsController } from './business-action-logs.controller';
import { BusinessActionLogsService } from './business-action-logs.service';

@Module({
  imports: [SequelizeModule.forFeature([BusinessActionLogModel])],
  controllers: [BusinessActionLogsController],
  providers: [BusinessActionLogsService],
  exports: [BusinessActionLogsService],
})
export class BusinessActionLogsModule {}
