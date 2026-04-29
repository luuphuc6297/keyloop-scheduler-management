import { z } from 'zod';

export const SearchCustomersSchema = z
  .object({
    q: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type SearchCustomersQuery = z.infer<typeof SearchCustomersSchema>;

export const AnonymizeCustomerSchema = z
  .object({
    reason: z.string().min(1).max(500),
  })
  .strict();

export type AnonymizeCustomerDto = z.infer<typeof AnonymizeCustomerSchema>;

export interface CustomerResponse {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  anonymized_at: string | null;
  created_at: string;
}

export interface CustomerExportResponse {
  customer: CustomerResponse;
  vehicles: Array<{
    id: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    created_at: string;
  }>;
  appointments: Array<{
    id: string;
    service_type_id: string;
    technician_id: string;
    bay_id: string;
    time_range: string;
    status: string;
    created_at: string;
  }>;
}
