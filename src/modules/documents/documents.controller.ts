import { Body, Controller, Get, Header, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DocumentsService } from './documents.service';
import { generateDocumentSchema, type GenerateDocumentDto } from './documents.schemas';

/**
 * Impresión de documentos, para las dos caras del ERP.
 *
 * La misma ruta sirve a operaciones y al portal del comercio: lo que se imprime lo arma la
 * pantalla —ella sabe qué está enseñando— y aquí sólo se comprueba que quien pide tiene sesión y
 * que lo que manda cabe en el contrato. Los roles incluyen a los del comercio a propósito: un
 * comercio tiene que poder llevarse en PDF su cartera, sus cobros y sus sucursales.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Roles(
    'ADMIN',
    'AUDITOR',
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'FINANCE',
    'LEGAL',
    'OPERATIONS',
    'COLLECTIONS',
    'ACCOUNTANT',
    'CFO',
    'TREASURY',
    'merchant',
    'MERCHANT_ADMIN',
    'MERCHANT_OPERATOR',
    'BRANCH_MANAGER',
    'FINANCIAL_AUDITOR',
  )
  @Get('health')
  health(): { enabled: boolean } {
    // Para que la pantalla pueda no ofrecer un botón que sabe que va a fallar.
    return { enabled: this.service.enabled };
  }

  @Roles(
    'ADMIN',
    'AUDITOR',
    'COMMERCIAL_EXECUTIVE',
    'COMMERCIAL_MANAGER',
    'FINANCE',
    'LEGAL',
    'OPERATIONS',
    'COLLECTIONS',
    'ACCOUNTANT',
    'CFO',
    'TREASURY',
    'merchant',
    'MERCHANT_ADMIN',
    'MERCHANT_OPERATOR',
    'BRANCH_MANAGER',
    'FINANCIAL_AUDITOR',
  )
  @Post('generate')
  @Header('Cache-Control', 'no-store')
  async generate(
    @Body(new ZodValidationPipe(generateDocumentSchema)) body: GenerateDocumentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const documento = await this.service.generate(body);
    res.setHeader('Content-Type', 'application/pdf');
    // `filename*` además de `filename`: los nombres llevan acentos y sin la forma UTF-8 el
    // navegador guarda «cartera-comisin.pdf».
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${documento.filename}"; filename*=UTF-8''${encodeURIComponent(documento.filename)}`,
    );
    return new StreamableFile(documento.buffer);
  }
}
