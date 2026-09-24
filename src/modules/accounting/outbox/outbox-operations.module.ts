import { Module } from '@nestjs/common';
import { BusinessActionLogsModule } from '../../business-action-logs/business-action-logs.module';
import { OutboxOperationsController } from './outbox-operations.controller';
import { OutboxOperationsService } from './outbox-operations.service';

@Module({
  imports: [BusinessActionLogsModule],
  controllers: [OutboxOperationsController],
  providers: [OutboxOperationsService],
})
export class OutboxOperationsModule {}
