import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  it('returns parsed data', () => {
    const pipe = new ZodValidationPipe(z.object({ page: z.coerce.number().int() }));
    expect(pipe.transform({ page: '1' })).toEqual({ page: 1 });
  });

  it('throws BadRequestException for invalid payload', () => {
    const pipe = new ZodValidationPipe(z.object({ email: z.string().email() }));
    expect(() => pipe.transform({ email: 'bad-email' })).toThrow(BadRequestException);
  });
});
