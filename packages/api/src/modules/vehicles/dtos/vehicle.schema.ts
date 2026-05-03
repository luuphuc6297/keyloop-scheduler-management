import { z } from 'zod';

// All filters optional — empty query returns the dealership's recent vehicles
// (RLS keeps it tenant-scoped). Useful for the standalone Vehicles page;
// callers that want strict filtering can still pass `vin` / `customer_id`.
export const SearchVehiclesSchema = z
  .object({
    vin: z.string().min(1).max(32).optional(),
    customer_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

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
