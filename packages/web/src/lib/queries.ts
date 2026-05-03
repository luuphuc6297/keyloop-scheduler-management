import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ulid } from 'ulid';
import { apiFetch, clearTokens, saveTokens } from './api';
import type {
  Appointment,
  AuthMe,
  AuthTokens,
  AvailabilitySlot,
  Bay,
  BookAppointmentInput,
  Customer,
  Dealership,
  ListAppointmentsResult,
  RescheduleAppointmentInput,
  ServiceType,
  Technician,
  Vehicle,
} from './types';

// ===== auth =====

export function useLogin() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const tokens = await apiFetch<AuthTokens>('/api/v1/auth/login', {
        method: 'POST',
        body: input,
        skipAuth: true,
      });
      saveTokens(tokens);
      return tokens;
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      } catch {
        // ignore — we clear tokens regardless
      }
      clearTokens();
      qc.clear();
    },
  });
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<AuthMe>('/api/v1/auth/me'),
    enabled,
    staleTime: 60_000,
  });
}

// ===== catalog =====

export function useDealership() {
  return useQuery({
    queryKey: ['dealership'],
    queryFn: () => apiFetch<Dealership>('/api/v1/dealerships/me'),
    staleTime: 5 * 60_000,
  });
}

export function useServiceTypes() {
  return useQuery({
    queryKey: ['catalog', 'service-types'],
    queryFn: async () =>
      (await apiFetch<{ data: ServiceType[] }>('/api/v1/dealerships/me/service-types')).data,
    staleTime: 5 * 60_000,
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ['catalog', 'technicians'],
    queryFn: async () =>
      (await apiFetch<{ data: Technician[] }>('/api/v1/dealerships/me/technicians')).data,
    staleTime: 5 * 60_000,
  });
}

export function useBays() {
  return useQuery({
    queryKey: ['catalog', 'bays'],
    queryFn: async () => (await apiFetch<{ data: Bay[] }>('/api/v1/dealerships/me/bays')).data,
    staleTime: 5 * 60_000,
  });
}

export function useCustomers(query: string, options?: { allowEmpty?: boolean }) {
  const allowEmpty = options?.allowEmpty ?? false;
  return useQuery({
    queryKey: ['customers', { q: query, allowEmpty }],
    queryFn: async () =>
      (
        await apiFetch<{ data: Customer[] }>('/api/v1/customers', {
          query: query.length > 0 ? { q: query, limit: 50 } : { limit: 50 },
        })
      ).data,
    // Booking dialog passes default (no allowEmpty) → only fetches when typing.
    // Customers page passes { allowEmpty: true } → fetches the full list on load.
    enabled: allowEmpty || query.length >= 2,
  });
}

export function useVehiclesByCustomer(customerId: string | null) {
  return useQuery({
    queryKey: ['vehicles', { customer_id: customerId }],
    queryFn: async () =>
      (
        await apiFetch<{ data: Vehicle[] }>('/api/v1/vehicles', {
          query: { customer_id: customerId ?? undefined },
        })
      ).data,
    enabled: Boolean(customerId),
  });
}

// ===== appointments =====

export interface ListAppointmentsParams {
  from?: string;
  to?: string;
  status?: string;
  technician_id?: string;
  bay_id?: string;
  customer_id?: string;
  limit?: number;
}

export function useAppointments(params: ListAppointmentsParams) {
  return useQuery({
    queryKey: ['appointments', 'list', params],
    queryFn: () =>
      apiFetch<ListAppointmentsResult>('/api/v1/appointments', {
        query: { ...params, limit: params.limit ?? 50 },
      }),
  });
}

export function useAvailability(params: {
  service_type_id: string | null;
  technician_id?: string;
  from: string;
  to: string;
  /**
   * When true, server also returns busy slots (`status='booked'`) inside
   * working hours — used by SlotPicker to render disabled tiles for conflicts
   * so reviewers see demand at a glance. Defaults to true.
   */
  include_busy?: boolean;
}) {
  const includeBusy = params.include_busy ?? true;
  return useQuery({
    queryKey: ['availability', { ...params, include_busy: includeBusy }],
    queryFn: async () =>
      (
        await apiFetch<{ data: AvailabilitySlot[] }>('/api/v1/appointments/availability', {
          query: {
            service_type_id: params.service_type_id ?? undefined,
            technician_id: params.technician_id,
            from: params.from,
            to: params.to,
            include_busy: includeBusy ? 'true' : undefined,
          },
        })
      ).data,
    enabled: Boolean(params.service_type_id),
  });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookAppointmentInput) =>
      apiFetch<Appointment>('/api/v1/appointments', {
        method: 'POST',
        body: input,
        headers: { 'idempotency-key': ulid() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; version: number; input: RescheduleAppointmentInput }) =>
      apiFetch<Appointment>(`/api/v1/appointments/${params.id}`, {
        method: 'PATCH',
        body: params.input,
        headers: { 'if-match': `"${params.version}"` },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; version: number }) =>
      apiFetch<Appointment>(`/api/v1/appointments/${params.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${params.version}"` },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

// ===== detail / history =====

export function useAppointment(id: string | null) {
  return useQuery({
    queryKey: ['appointments', 'detail', id],
    queryFn: () => apiFetch<Appointment>(`/api/v1/appointments/${id}`),
    enabled: Boolean(id),
  });
}

export interface AppointmentHistoryEntry {
  id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

export function useAppointmentHistory(id: string | null) {
  return useQuery({
    queryKey: ['appointments', 'history', id],
    queryFn: async () =>
      (await apiFetch<{ data: AppointmentHistoryEntry[] }>(`/api/v1/appointments/${id}/history`)).data,
    enabled: Boolean(id),
  });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => apiFetch<Customer>(`/api/v1/customers/${id}`),
    enabled: Boolean(id),
  });
}

export function useAnonymizeCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; reason: string }) =>
      apiFetch<Customer>(`/api/v1/customers/${params.id}`, {
        method: 'DELETE',
        body: { reason: params.reason },
      }),
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', 'detail', params.id] });
    },
  });
}

export interface BusinessHours {
  hours: Array<{ day_of_week: number; open_time: string; close_time: string }>;
  exceptions: Array<{
    date: string;
    is_closed: boolean;
    override_open: string | null;
    override_close: string | null;
    reason: string | null;
  }>;
}

export function useBusinessHours() {
  return useQuery({
    queryKey: ['catalog', 'business-hours'],
    queryFn: () => apiFetch<BusinessHours>('/api/v1/dealerships/me/business-hours'),
    staleTime: 5 * 60_000,
  });
}

export function useVehicleSearch(vin: string) {
  return useQuery({
    queryKey: ['vehicles', { vin }],
    queryFn: async () =>
      (
        await apiFetch<{ data: import('./types').Vehicle[] }>('/api/v1/vehicles', {
          // Empty `vin` returns the recent list (API now allows it).
          query: vin.length > 0 ? { vin, limit: 50 } : { limit: 50 },
        })
      ).data,
  });
}
