import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Generación documental del ERP.
 *
 * No tiene modelos ni base de datos: es una puerta hacia el worker de PDF, que vive fuera. Se
 * mantiene como módulo propio —en vez de colgarlo de contabilidad o del portal— porque lo usan
 * las dos caras del ERP y no pertenece a ninguna.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, JwtAuthGuard, RolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
