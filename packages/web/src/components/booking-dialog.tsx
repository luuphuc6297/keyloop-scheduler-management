'use client';

import { useMemo, useState } from 'react';
import { ApiClientError } from '@/lib/api';
import {
  useAvailability,
  useBays,
  useBookAppointment,
  useCustomers,
  useServiceTypes,
  useTechnicians,
  useVehiclesByCustomer,
} from '@/lib/queries';
import { formatSlot } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  timezone: string;
  onClose: () => void;
}

export function BookingDialog({ open, timezone, onClose }: Props) {
  const [serviceTypeId, setServiceTypeId] = useState<string>('');
  const [technicianId, setTechnicianId] = useState<string>('');
  const [bayId, setBayId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviceTypes = useServiceTypes();
  const technicians = useTechnicians();
  const bays = useBays();
  const customers = useCustomers(customerSearch);
  const vehicles = useVehiclesByCustomer(customerId || null);

  // Default search window: today 06:00 → +14 days at the dealership tz
  const window = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const availability = useAvailability({
    service_type_id: serviceTypeId || null,
    technician_id: technicianId || undefined,
    from: window.from,
    to: window.to,
  });

  const book = useBookAppointment();
  const canSubmit =
    serviceTypeId && technicianId && bayId && customerId && vehicleId && selectedSlot && !book.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await book.mutateAsync({
        start_at: selectedSlot!,
        customer_id: customerId,
        vehicle_id: vehicleId,
        service_type_id: serviceTypeId,
        technician_id: technicianId,
        bay_id: bayId,
      });
      reset();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.body.code ?? err.status;
        setError(`${code}: ${err.body.message ?? err.message}`);
      } else {
        setError((err as Error).message);
      }
    }
  }

  function reset() {
    setServiceTypeId('');
    setTechnicianId('');
    setBayId('');
    setCustomerSearch('');
    setCustomerId('');
    setVehicleId('');
    setSelectedSlot(null);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>
            Pick a service, technician, and an available slot. Submission sends an{' '}
            <code>Idempotency-Key</code> so retries are safe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-type">Service</Label>
              <select
                id="service-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={serviceTypeId}
                onChange={(e) => {
                  setServiceTypeId(e.target.value);
                  setSelectedSlot(null);
                }}
              >
                <option value="">Select…</option>
                {serviceTypes.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes}m + {s.buffer_minutes}m buffer)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="technician">Technician</Label>
              <select
                id="technician"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={technicianId}
                onChange={(e) => {
                  setTechnicianId(e.target.value);
                  setSelectedSlot(null);
                }}
              >
                <option value="">Any qualified</option>
                {technicians.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bay">Bay</Label>
              <select
                id="bay"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={bayId}
                onChange={(e) => setBayId(e.target.value)}
              >
                <option value="">Select…</option>
                {bays.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-search">Customer search</Label>
              <Input
                id="customer-search"
                placeholder="Type name or email…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customers.data && customers.data.length > 0 ? (
                <div className="max-h-32 overflow-y-auto rounded-md border text-sm">
                  {customers.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerSearch(`${c.first_name} ${c.last_name}`);
                        setVehicleId('');
                      }}
                      className={`block w-full px-3 py-1.5 text-left hover:bg-muted ${
                        customerId === c.id ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      {c.first_name} {c.last_name}{' '}
                      <span className="text-muted-foreground">— {c.email}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vehicle">Vehicle</Label>
              <select
                id="vehicle"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={vehicleId}
                disabled={!customerId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">{customerId ? 'Select…' : 'Pick a customer first'}</option>
                {vehicles.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model} — VIN {v.vin}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available slots</Label>
            {!serviceTypeId ? (
              <p className="text-sm text-muted-foreground">Select a service to see available times.</p>
            ) : availability.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading availability…</p>
            ) : availability.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots in this 14-day window.</p>
            ) : (
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
                {availability.data?.slice(0, 60).map((slot) => {
                  const isSelected = selectedSlot === slot.start_at;
                  return (
                    <button
                      key={slot.start_at + slot.technician_id}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot.start_at);
                        if (!technicianId) setTechnicianId(slot.technician_id);
                      }}
                      className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
                        isSelected ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                      }`}
                    >
                      {formatSlot(slot.start_at, timezone)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {book.isPending ? 'Booking…' : 'Book appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
