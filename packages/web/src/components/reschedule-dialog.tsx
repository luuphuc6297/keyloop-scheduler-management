'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ApiClientError } from '@/lib/api';
import { lookupError, lookupErrorFromResponse } from '@/lib/error-messages';
import { parseTimeRange } from '@/lib/format';
import { useAvailability, useRescheduleAppointment } from '@/lib/queries';
import type { Appointment } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  appointment: Appointment;
  timezone: string;
  onClose: () => void;
}

export function RescheduleDialog({ appointment, timezone, onClose }: Props) {
  const { lower } = parseTimeRange(appointment.time_range);
  // Normalize to UTC ISO so string comparison against backend-emitted slots
  // (which are also `.toUTC().toISO()`) is reliable. Without this normalization
  // the "current" tile gets duplicated when include_busy=true.
  const currentStartIso = lower.toUTC().toISO()!;

  // Default-select the current slot — picking nothing is a no-op the server
  // would reject; this gives the dialog a sensible starting state and the
  // user just has to pick a *different* tile to enable Save.
  const [selectedSlot, setSelectedSlot] = useState<string | null>(currentStartIso);
  const [error, setError] = useState<ReturnType<typeof lookupError> | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const reschedule = useRescheduleAppointment();

  // 14-day window starting today (dealership-local "today" is approximated by
  // the user's clock — close enough; the server still authoritative).
  const window = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const availability = useAvailability({
    service_type_id: appointment.service_type_id,
    technician_id: appointment.technician_id,
    from: window.from,
    to: window.to,
  });

  // The current slot is filtered out of /availability (it's already booked),
  // but we still want it visible as a "now" reference. Synthesize it.
  const slotsWithCurrent = useMemo(() => {
    const fetched = availability.data ?? [];
    if (fetched.some((s) => s.start_at === currentStartIso)) return fetched;
    return [
      {
        start_at: currentStartIso,
        end_at: currentStartIso,
        technician_id: appointment.technician_id,
        bay_id: appointment.bay_id,
      },
      ...fetched,
    ];
  }, [availability.data, currentStartIso, appointment.technician_id, appointment.bay_id]);

  // Clear stale server alerts whenever user picks a different slot.
  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || selectedSlot === currentStartIso) return;
    setError(null);
    try {
      await reschedule.mutateAsync({
        id: appointment.id,
        version: appointment.version,
        input: { start_at: selectedSlot },
      });
      toast.success('Appointment rescheduled');
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        // Surface the raw server response in console so reviewers can debug
        // even if the FE error mapper falls through to the generic fallback.
        // eslint-disable-next-line no-console
        console.warn('[reschedule] API rejected the request', {
          status: err.status,
          body: err.body,
          sentVersion: appointment.version,
          sentStartAt: selectedSlot,
        });
        setError(lookupErrorFromResponse(err));
        setShakeKey((k) => k + 1);
      } else {
        // eslint-disable-next-line no-console
        console.error('[reschedule] non-API error', err);
        setError({ title: 'Reschedule failed', detail: (err as Error).message, variant: 'error' });
      }
    }
  }

  const canSubmit = !!selectedSlot && selectedSlot !== currentStartIso && !reschedule.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            Server checks <code className="font-mono">If-Match: &quot;{appointment.version}&quot;</code> for
            optimistic locking. Pick from the slots the dealership is open for — unavailable times
            are not shown.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Available slots</Label>
              <span className="text-xs text-muted-foreground">{timezone}</span>
            </div>
            <SlotPicker
              slots={slotsWithCurrent}
              selectedStartAt={selectedSlot}
              currentStartAt={currentStartIso}
              timezone={timezone}
              loading={availability.isLoading}
              emptyMessage="No open slots in the next 14 days for this technician + service."
              onSelect={setSelectedSlot}
            />
            <p className="text-xs text-muted-foreground">
              Slots respect business hours, technician shifts, time-off and existing bookings.
            </p>
          </div>

          {error ? (
            <motion.div
              key={shakeKey}
              animate={{ x: [0, -4, 4, -3, 2, 0] }}
              transition={{ duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] }}
            >
              <Alert
                variant={
                  error.variant === 'info'
                    ? 'info'
                    : error.variant === 'warning'
                      ? 'warning'
                      : 'danger'
                }
              >
                <AlertTitle>{error.title}</AlertTitle>
                <AlertDescription>
                  {error.detail}
                  {error.title === 'Modified by someone else' ? (
                    <span className="mt-2 block text-xs italic">
                      Tip: close this dialog, refresh the row, then try again — the version was
                      updated by another tab.
                    </span>
                  ) : null}
                </AlertDescription>
              </Alert>
            </motion.div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {reschedule.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
