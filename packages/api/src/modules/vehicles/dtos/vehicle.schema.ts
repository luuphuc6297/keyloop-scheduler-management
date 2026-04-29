import { z } from 'zod';

export const SearchVehiclesSchema = z
  .object({
    vin: z.string().min(1).max(32).optional(),
    customer_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((d) => d.vin !== undefined || d.customer_id !== undefined, {
    message: 'Either `vin` or `customer_id` must be provided',
  });

export type SearchVehiclesQuery = z.infer<typeof SearchVehiclesSchema>;

export interface VehicleResponse {
  id: string;
  customer_id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  created_at: string;
  updated_at: string;
}
