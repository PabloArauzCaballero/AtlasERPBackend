import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type {
  AttachChecklistEvidenceDto,
  ChecklistEvidenceUploadUrlDto,
  ChecklistItemIdParamsDto,
  CompleteChecklistItemDto,
  OnboardingCaseIdParamsDto,
} from '../b2b-sales-crm.dtos';
import {
  attachChecklistEvidenceSchema,
  checklistEvidenceUploadUrlSchema,
  checklistItemIdParamsSchema,
  completeChecklistItemSchema,
  onboardingCaseIdParamsSchema,
} from '../b2b-sales-crm.schemas';
import { OnboardingChecklistService } from '../services/onboarding/onboarding-checklist.service';
import { requireUpstreamToken } from './onboarding-upstream-token';

/** Checklist del caso y su evidencia: `b2b/onboarding/cases/:id/checklist/...`. */
@Controller('b2b/onboarding')
export class OnboardingChecklistController {
  constructor(private readonly checklist: OnboardingChecklistService) {}

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Patch('cases/:onboardingCaseId/checklist')
  completeChecklistItem(
    @Param(new ZodValidationPipe(onboardingCaseIdParamsSchema)) params: OnboardingCaseIdParamsDto,
    @Body(new ZodValidationPipe(completeChecklistItemSchema)) body: CompleteChecklistItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.checklist.completeChecklistItem(params.onboardingCaseId, body, user);
  }

  /*
   * El archivo del requisito. Tres pasos, como el poder del comercio: permiso firmado que emite
   * AtlasBackend, subida directa del navegador al almacén, y registro aquí tras la verificación
   * del objeto. Los bytes se sirven con la sesión, nunca por URL.
   */
  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases/:onboardingCaseId/checklist/:checklistItemId/evidence/upload-url')
  checklistEvidenceUploadUrl(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Body(new ZodValidationPipe(checklistEvidenceUploadUrlSchema))
    body: ChecklistEvidenceUploadUrlDto,
  ): Promise<Record<string, unknown>> {
    return this.checklist.createChecklistEvidenceUploadUrl(
      params.onboardingCaseId,
      params.checklistItemId,
      body,
      requireUpstreamToken(req),
    );
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN')
  @Post('cases/:onboardingCaseId/checklist/:checklistItemId/evidence')
  attachChecklistEvidence(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Body(new ZodValidationPipe(attachChecklistEvidenceSchema)) body: AttachChecklistEvidenceDto,
  ): Promise<Record<string, unknown>> {
    return this.checklist.attachChecklistEvidence(
      params.onboardingCaseId,
      params.checklistItemId,
      body,
      requireUpstreamToken(req),
    );
  }

  @Roles('OPERATIONS', 'LEGAL', 'ADMIN', 'COMMERCIAL_MANAGER')
  @Get('cases/:onboardingCaseId/checklist/:checklistItemId/evidence/content')
  @Header('Cache-Control', 'private, max-age=60')
  async checklistEvidenceContent(
    @Req() req: Request,
    @Param(new ZodValidationPipe(checklistItemIdParamsSchema)) params: ChecklistItemIdParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.checklist.readChecklistEvidence(
      params.onboardingCaseId,
      params.checklistItemId,
      requireUpstreamToken(req),
    );
    res.setHeader('Content-Type', archivo.contentType);
    return new StreamableFile(archivo.buffer);
  }
}
