// Shapes that mirror the API responses. Kept hand-written rather than generated
// because the surface is small and the manual definitions double as docs.

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthMe {
  id: string;
  email: string;
  dealershipId: string;
  roles: string[];
}

export interface ApiError {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  message?: string;
  conflictingResource?: string;
  currentVersion?: number;
  request_id?: string;
}

export interface Appointment {
  id: string;
  dealership_id: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
  time_range: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ListAppointmentsResult {
  data: Appointment[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface AvailabilitySlot {
  start_at: string;
  end_at: string;
  technician_id: string;
  bay_id: string | null;
}

export interface ServiceType {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  required_skill_id: string | null;
}

export interface Technician {
  id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  is_active: boolean;
  skills: string[];
}

export interface Bay {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  anonymized_at: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  created_at: string;
  updated_at: string;
}

export interface Dealership {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BookAppointmentInput {
  start_at: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
}

export interface RescheduleAppointmentInput {
  start_at?: string;
  technician_id?: string;
  bay_id?: string;
}
