import { z } from 'zod';

export const LoginSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(256),
  })
  .strict();

export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshSchema = z
  .object({
    refresh_token: z.string().min(20).max(512),
  })
  .strict();

export type RefreshDto = z.infer<typeof RefreshSchema>;
