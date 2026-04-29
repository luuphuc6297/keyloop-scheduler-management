import { z } from 'zod';

/**
 * Availability query — return free 30-min slot starts in `[from, to)` for the given
 * service type and (optional) technician. If no technician_id is supplied, slots
 * are returned for the entire pool of technicians who have the required skill.
 */
export const AvailabilityQuerySchema = z
  .object({
    service_type_id: z.string().uuid(),
    technician_id: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    bay_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((d) => new Date(d.from) < new Date(d.to), { message: '`from` must be < `to`' });

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export interface AvailabilitySlot {
  start_at: string;
  end_at: string;
  technician_id: string;
  bay_id: string | null;
}
