import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SequelizeModule } from '@nestjs/sequelize';
import { filesModels } from '../../database/models';
import { CloudinaryService } from './cloudinary.service';
import { ErpFilesService } from './erp-files.service';
import { FilesController } from './files.controller';

@Module({
  imports: [HttpModule.register({ timeout: 15_000 }), SequelizeModule.forFeature(filesModels)],
  controllers: [FilesController],
  providers: [ErpFilesService, CloudinaryService],
  exports: [ErpFilesService],
})
export class FilesModule {}
