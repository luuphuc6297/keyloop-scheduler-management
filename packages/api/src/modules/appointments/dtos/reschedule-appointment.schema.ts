import { z } from 'zod';

/**
 * Reschedule DTO — at least one of start_at / technician_id / bay_id must be present.
 * The controller enforces `If-Match: "<version>"` separately.
 */
export const RescheduleAppointmentSchema = z
  .object({
    start_at: z.string().datetime({ offset: true }).optional(),
    technician_id: z.string().uuid().optional(),
    bay_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((d) => d.start_at !== undefined || d.technician_id !== undefined || d.bay_id !== undefined, {
    message: 'At least one of start_at, technician_id, bay_id must be provided',
  });

export type RescheduleAppointmentDto = z.infer<typeof RescheduleAppointmentSchema>;
