import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LegalEntityAccessService } from '../../../common/services/legal-entity-access.service';
import { ElectronicTaxDocumentModel, LegalEntityModel, siatModels } from '../../../database/models';
import { AccountingModule } from '../../accounting/accounting.module';
import { DocumentsModule } from '../../documents/documents.module';
import { FiscalPdfService } from './application/fiscal-pdf.service';
import { FiscalDocumentProcessor } from './application/fiscal-document.processor';
import { FiscalDocumentsService } from './application/fiscal-documents.service';
import { SiatAnnulmentService } from './application/siat-annulment.service';
import { SiatCatalogSyncService } from './application/siat-catalog-sync.service';
import { SiatContingencyService } from './application/siat-contingency.service';
import { SiatCredentialsService } from './application/siat-credentials.service';
import { SiatDispatchService } from './application/siat-dispatch.service';
import { SiatEmissionService } from './application/siat-emission.service';
import { SiatGatewayService } from './application/siat-gateway.service';
import { SiatIssuerProfileService } from './application/siat-issuer-profile.service';
import { SiatStatusService } from './application/siat-status.service';
import { FiscalDocumentsController } from './controllers/fiscal-documents.controller';
import { FiscalSiatController } from './controllers/fiscal-siat.controller';

/** Facturación electrónica con el SIAT (plan de facturación SIAT, F2-F3). */
@Module({
  imports: [
    SequelizeModule.forFeature([...siatModels, ElectronicTaxDocumentModel, LegalEntityModel]),
    AccountingModule,
    DocumentsModule,
  ],
  controllers: [FiscalSiatController, FiscalDocumentsController],
  providers: [
    SiatGatewayService,
    SiatCredentialsService,
    SiatCatalogSyncService,
    SiatIssuerProfileService,
    SiatStatusService,
    SiatContingencyService,
    SiatEmissionService,
    SiatDispatchService,
    SiatAnnulmentService,
    FiscalDocumentsService,
    FiscalDocumentProcessor,
    FiscalPdfService,
    LegalEntityAccessService,
  ],
  exports: [
    SiatGatewayService,
    SiatEmissionService,
    SiatIssuerProfileService,
    SiatCatalogSyncService,
  ],
})
export class FiscalSiatModule {}
