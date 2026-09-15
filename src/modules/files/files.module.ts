import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { filesModels } from '../../database/models';
import { PartnerOnboardingGatewayModule } from '../partner-onboarding-gateway/partner-onboarding-gateway.module';
import { ErpFilesService } from './erp-files.service';
import { FilesController } from './files.controller';

/** Los archivos viven en el almacén de evidencia de Atlas; el cliente de la pasarela es quien habla con él. */
@Module({
  imports: [PartnerOnboardingGatewayModule, SequelizeModule.forFeature(filesModels)],
  controllers: [FilesController],
  providers: [ErpFilesService],
  exports: [ErpFilesService],
})
export class FilesModule {}
