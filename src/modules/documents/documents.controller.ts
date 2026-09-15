import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DocumentsService } from './documents.service';
import { generateDocumentSchema, type GenerateDocumentDto } from './documents.schemas';
import {
  PUBLIC_PAPER_FORMS,
  findPublicPaperForm,
  formVersionOf,
  publicPaperFormPayload,
} from './forms/public-forms.registry';

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
    return this.entregar(res, documento);
  }

  /**
   * Formularios en papel que se pueden imprimir sin cuenta.
   *
   * Públicos y con límite de tasa propio: son para el comercio que todavía no existe en el
   * sistema y quiere rellenar a mano su solicitud. Diez por minuto y por origen es más de lo
   * que imprime una oficina y menos de lo que necesita alguien para ocupar el worker.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('forms')
  listPublicForms(): { forms: Array<{ formCode: string; title: string; formVersion: string }> } {
    return {
      forms: PUBLIC_PAPER_FORMS.map((form) => ({
        formCode: form.formCode,
        title: form.title,
        formVersion: formVersionOf(form.build()),
      })),
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('forms/:formCode')
  @Header('Cache-Control', 'no-store')
  async publicForm(
    @Param('formCode') formCode: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const form = findPublicPaperForm(formCode);
    if (!form) {
      throw new NotFoundException({
        code: 'PAPER_FORM_NOT_FOUND',
        message: 'Ese formulario no existe o no se imprime sin sesión.',
      });
    }
    const documento = await this.service.generate({
      templateId: 'blank-form',
      filename: `${form.formCode.toLowerCase()}.pdf`,
      payload: publicPaperFormPayload(form),
    });
    return this.entregar(res, documento);
  }

  private entregar(res: Response, documento: { buffer: Buffer; filename: string }): StreamableFile {
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
