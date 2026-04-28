import { z } from 'zod';
import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ email: z.string().email(), age: z.number().int().min(0) }).strict();
const meta: ArgumentMetadata = { type: 'body' };

describe('ZodValidationPipe', () => {
  it('returns parsed value on valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    const out = pipe.transform({ email: 'a@example.com', age: 5 }, meta);
    expect(out).toEqual({ email: 'a@example.com', age: 5 });
  });

  it('throws BadRequestException with details on invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: 'not-an-email', age: -1 }, meta);
      throw new Error('Pipe should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Array.isArray(body.errors)).toBe(true);
      expect((body.errors as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects extra fields with .strict() schema', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ email: 'a@example.com', age: 5, extra: 1 }, meta)).toThrow(
      BadRequestException,
    );
  });

  it('reports each error issue with path, message, code', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: 'bad', age: 'not-a-number' }, meta);
      throw new Error('Pipe should have thrown');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as { errors: Array<Record<string, unknown>> };
      const first = body.errors[0];
      expect(first).toBeDefined();
      expect(first).toHaveProperty('path');
      expect(first).toHaveProperty('message');
      expect(first).toHaveProperty('code');
    }
  });
});
