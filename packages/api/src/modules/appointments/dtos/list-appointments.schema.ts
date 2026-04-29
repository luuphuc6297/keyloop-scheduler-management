import { z } from 'zod';

const StatusValues = ['confirmed', 'completed', 'cancelled', 'no_show'] as const;

/**
 * List query parameters. All filters optional. Pagination is cursor-based.
 * Cursor encodes `(lower(time_range), id)` as base64 for stable ordering.
 */
export const ListAppointmentsSchema = z
  .object({
    status: z.enum(StatusValues).optional(),
    technician_id: z.string().uuid().optional(),
    bay_id: z.string().uuid().optional(),
    customer_id: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsSchema>;

/** Encode a cursor from `(lower_bound_iso, id)`. */
export function encodeCursor(lowerBound: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: lowerBound, i: id }), 'utf8').toString('base64url');
}

export interface DecodedCursor {
  t: string;
  i: string;
}

export function decodeCursor(raw: string): DecodedCursor {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as DecodedCursor).t !== 'string' ||
      typeof (parsed as DecodedCursor).i !== 'string'
    ) {
      throw new Error('cursor missing required fields');
    }
    return parsed as DecodedCursor;
  } catch (err) {
    throw new Error(`Invalid cursor: ${(err as Error).message}`);
  }
}
