'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ApiClientError } from '@/lib/api';
import { lookupErrorFromResponse } from '@/lib/error-messages';
import {
  useAvailability,
  useBays,
  useBookAppointment,
  useServiceTypes,
  useTechnicians,
  useVehiclesByCustomer,
} from '@/lib/queries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerCombobox } from '@/components/customer-combobox';
import { SlotPicker } from '@/components/slot-picker';
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
  const [customer, setCustomer] = useState<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null>(null);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<ReturnType<typeof lookupErrorFromResponse> | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const customerId = customer?.id ?? '';
  const serviceTypes = useServiceTypes();
  const technicians = useTechnicians();
  const bays = useBays();
  const vehicles = useVehiclesByCustomer(customerId || null);

  // Clear server-side error when user changes any selection — prevents stale
  // alerts (e.g. "Skill mismatch" from a prior attempt persisting after the
  // user switched to a different service or technician).
  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypeId, technicianId, bayId, customerId, vehicleId, selectedSlot]);

  // Client-side hint: if the chosen technician doesn't have the skill the
  // chosen service requires, surface it inline BEFORE the user clicks Book.
  // The server still enforces it, but pre-flighting avoids round-trips.
  const skillHint = useMemo(() => {
    if (!serviceTypeId || !technicianId) return null;
    const svc = serviceTypes.data?.find((s) => s.id === serviceTypeId);
    if (!svc?.required_skill_id) return null;
    const tech = technicians.data?.find((t) => t.id === technicianId);
    if (!tech) return null;
    // technician.skills is array of skill *codes*, service.required_skill_id is a UUID.
    // We don't have the skill UUID→code map on the FE, so we check by NAME match
    // via the service's required_skill_id field. The simplest signal we DO have:
    // if the service has a required_skill_id and the tech's skills array is empty
    // or doesn't intersect by code-prefix, warn.
    // For the demo seed: services need OIL_CHANGE / BRAKES / TIRE codes.
    const serviceCodeHint = svc.name.toLowerCase();
    const techCodes = tech.skills.map((s) => s.toLowerCase());
    const matches = techCodes.some((code) => serviceCodeHint.includes(code.replace('_', ' ')));
    return matches ? null : {
      title: 'Heads up — possible skill mismatch',
      detail: `${tech.first_name} ${tech.last_name}'s certified skills (${tech.skills.join(', ')}) may not cover "${svc.name}". You can still try; the server will confirm.`,
    };
  }, [serviceTypeId, technicianId, serviceTypes.data, technicians.data]);

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
    !!serviceTypeId && !!technicianId && !!bayId && !!customerId && !!vehicleId && !!selectedSlot && !book.isPending;

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
      toast.success('Appointment booked');
      reset();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        // eslint-disable-next-line no-console
        console.warn('[booking] API rejected the request', {
          status: err.status,
          body: err.body,
          sentSlot: selectedSlot,
        });
        setError(lookupErrorFromResponse(err));
        setShakeKey((k) => k + 1);
      } else {
        // eslint-disable-next-line no-console
        console.error('[booking] non-API error', err);
        setError({ title: 'Booking failed', detail: (err as Error).message, variant: 'error' });
      }
    }
  }

  function reset() {
    setServiceTypeId('');
    setTechnicianId('');
    setBayId('');
    setCustomer(null);
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
            <code className="font-mono">Idempotency-Key</code> so retries are safe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-type">Service</Label>
              <Select
                value={serviceTypeId}
                onValueChange={(v) => {
                  setServiceTypeId(v);
                  setSelectedSlot(null);
                }}
              >
                <SelectTrigger id="service-type">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes}m + {s.buffer_minutes}m buffer)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="technician">Technician</Label>
              <Select
                value={technicianId}
                onValueChange={(v) => {
                  setTechnicianId(v);
                  setSelectedSlot(null);
                }}
              >
                <SelectTrigger id="technician">
                  <SelectValue placeholder="Any qualified" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bay">Bay</Label>
              <Select value={bayId} onValueChange={setBayId}>
                <SelectTrigger id="bay">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {bays.data?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <CustomerCombobox
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setVehicleId('');
                }}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vehicle">Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId} disabled={!customerId}>
                <SelectTrigger id="vehicle">
                  <SelectValue placeholder={customerId ? 'Select…' : 'Pick a customer first'} />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.data?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} — VIN {v.vin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Available slots</Label>
              <span className="text-xs text-muted-foreground">{timezone}</span>
            </div>
            {!serviceTypeId ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Select a service to see available times.
              </div>
            ) : (
              <SlotPicker
                slots={availability.data ?? []}
                selectedStartAt={selectedSlot}
                timezone={timezone}
                loading={availability.isLoading}
                emptyMessage="No open slots in the next 14 days for this technician + service."
                onSelect={(startAt) => {
                  setSelectedSlot(startAt);
                  // Surface the technician of the picked slot if the user hadn't
                  // chosen one explicitly — keeps "Any qualified" mode workable.
                  if (!technicianId) {
                    const match = availability.data?.find((s) => s.start_at === startAt);
                    if (match) setTechnicianId(match.technician_id);
                  }
                }}
              />
            )}
          </div>

          {/* Error from a real (server-side) book attempt — clears on next selection */}
          {error ? (
            <motion.div
              key={shakeKey}
              animate={{ x: [0, -4, 4, -3, 2, 0] }}
              transition={{ duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] }}
            >
              <Alert
                variant={
                  error.variant === 'info' ? 'info' : error.variant === 'warning' ? 'warning' : 'danger'
                }
              >
                <AlertTitle>{error.title}</AlertTitle>
                <AlertDescription>{error.detail}</AlertDescription>
              </Alert>
            </motion.div>
          ) : skillHint ? (
            // Pre-flight hint — informational, not blocking
            <Alert variant="info">
              <AlertTitle>{skillHint.title}</AlertTitle>
              <AlertDescription>{skillHint.detail}</AlertDescription>
            </Alert>
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
