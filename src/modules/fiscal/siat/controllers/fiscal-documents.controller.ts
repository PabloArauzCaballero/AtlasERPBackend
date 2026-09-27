import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { FiscalDocumentsService } from '../application/fiscal-documents.service';
import { FiscalPdfService } from '../application/fiscal-pdf.service';
import { SiatAnnulmentService } from '../application/siat-annulment.service';
import { SiatContingencyService } from '../application/siat-contingency.service';
import { SiatDispatchService } from '../application/siat-dispatch.service';
import {
  AnnulFiscalDocumentDto,
  annulFiscalDocumentSchema,
  ListFiscalDocumentsQuery,
  listFiscalDocumentsQuerySchema,
} from '../fiscal-siat.schemas';

/**
 * Documentos fiscales y contingencias. Ninguna ruta llama al SIN desde la petición salvo la
 * anulación (que es una orden explícita del operador) y el despacho manual de una contingencia:
 * «Reintentar» sólo adelanta el próximo intento del procesador.
 */
@Roles('admin', 'accountant')
@Controller('accounting/fiscal')
export class FiscalDocumentsController {
  constructor(
    private readonly documents: FiscalDocumentsService,
    private readonly dispatch: SiatDispatchService,
    private readonly annulment: SiatAnnulmentService,
    private readonly contingency: SiatContingencyService,
    private readonly fiscalPdf: FiscalPdfService,
  ) {}

  @Get('documents')
  list(
    @Query(new ZodValidationPipe(listFiscalDocumentsQuerySchema)) query: ListFiscalDocumentsQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.listar(query, user);
  }

  @Get('documents/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.documents.detalle(id, user);
  }

  @Get('documents/:id/xml')
  async xml(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { xml, filename } = await this.documents.xml(id, user);
    res.setHeader('content-type', 'application/xml; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(xml);
  }

  /** Representación gráfica (PDF) del documento: sólo desde su XML, nunca desde el cuerpo. */
  @Get('documents/:id/pdf')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const documento = await this.documents.obtener(id, user);
    const { buffer, filename } = await this.fiscalPdf.pdf(documento);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Post('documents/:id/retry')
  async retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.documents.obtener(id, user);
    const adelantado = await this.dispatch.adelantar(id);
    if (!adelantado) {
      throw new NotFoundException({
        code: 'FISCAL_DOCUMENT_NOT_RETRYABLE',
        message: 'Sólo se reintenta un documento en error de envío.',
      });
    }
    return { id, reintento: 'PROGRAMADO' };
  }

  @Post('documents/:id/annul')
  annul(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(annulFiscalDocumentSchema)) body: AnnulFiscalDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.annulment.anular(id, body.codigoMotivo, user);
  }

  @Get('events')
  events(@CurrentUser() user: AuthUser) {
    return this.documents.eventos(user);
  }

  @Post('events/dispatch')
  async dispatchEvents() {
    await this.contingency.procesar();
    return { despachado: true };
  }
}
