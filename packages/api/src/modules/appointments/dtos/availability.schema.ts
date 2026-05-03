import { z } from 'zod';

/**
 * Availability query — return free 30-min slot starts in `[from, to)` for the given
 * service type and (optional) technician. If no technician_id is supplied, slots
 * are returned for the entire pool of technicians who have the required skill.
 *
 * `include_busy` (default false): when true, also emit slots that fall inside
 * the technician's working window but overlap an existing confirmed booking,
 * with `status = 'booked'`. Frontend uses this to render a greyed-out tile
 * instead of just hiding the time, so the user sees demand at a glance.
 */
export const AvailabilityQuerySchema = z
  .object({
    service_type_id: z.string().uuid(),
    technician_id: z.string().uuid().optional(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    bay_id: z.string().uuid().optional(),
    include_busy: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .optional(),
  })
  .strict()
  .refine((d) => new Date(d.from) < new Date(d.to), { message: '`from` must be < `to`' });

export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export type AvailabilitySlotStatus = 'available' | 'booked';

export interface AvailabilitySlot {
  start_at: string;
  end_at: string;
  technician_id: string;
  bay_id: string | null;
  /** Always present when `include_busy=true`; omitted otherwise (back-compat). */
  status?: AvailabilitySlotStatus;
}
