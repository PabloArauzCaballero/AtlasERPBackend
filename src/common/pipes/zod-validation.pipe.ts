import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { createContextLogger } from '../logging/root-pino-logger';

@Injectable()
export class ZodValidationPipe<TInput = unknown, TOutput = unknown> implements PipeTransform<
  TInput,
  TOutput
> {
  private readonly logger = createContextLogger(ZodValidationPipe.name);

  constructor(private readonly schema: ZodSchema<TOutput>) {}

  transform(value: TInput): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      this.logger.warn(
        {
          issueCount: result.error.issues.length,
          fields: result.error.issues.map((issue) => issue.path.join('.')),
        },
        'Request validation rejected by Zod schema',
      );

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
