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

export function useCustomers(query: string) {
  return useQuery({
    queryKey: ['customers', { q: query }],
    queryFn: async () =>
      (await apiFetch<{ data: Customer[] }>('/api/v1/customers', { query: { q: query, limit: 20 } })).data,
    enabled: query.length >= 2,
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
}) {
  return useQuery({
    queryKey: ['availability', params],
    queryFn: async () =>
      (
        await apiFetch<{ data: AvailabilitySlot[] }>('/api/v1/appointments/availability', {
          query: {
            service_type_id: params.service_type_id ?? undefined,
            technician_id: params.technician_id,
            from: params.from,
            to: params.to,
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
