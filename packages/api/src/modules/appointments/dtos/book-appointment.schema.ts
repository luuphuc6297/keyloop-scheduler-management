import { z } from 'zod';

export const BookAppointmentSchema = z
  .object({
    start_at: z.string().datetime({ offset: true }),
    customer_id: z.string().uuid(),
    vehicle_id: z.string().uuid(),
    service_type_id: z.string().uuid(),
    technician_id: z.string().uuid(),
    bay_id: z.string().uuid(),
  })
  .strict();

export type BookAppointmentDto = z.infer<typeof BookAppointmentSchema>;

export interface AppointmentResponse {
  id: string;
  dealership_id: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
  time_range: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}
