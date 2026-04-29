'use client';

import { useState } from 'react';
import { ApiClientError } from '@/lib/api';
import { isoToLocalInput, localInputToZoned, parseTimeRange } from '@/lib/format';
import { useRescheduleAppointment } from '@/lib/queries';
import type { Appointment } from '@/lib/types';
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
  appointment: Appointment;
  timezone: string;
  onClose: () => void;
}

export function RescheduleDialog({ appointment, timezone, onClose }: Props) {
  const { lower } = parseTimeRange(appointment.time_range);
  const [startLocal, setStartLocal] = useState(isoToLocalInput(lower.toISO()!, timezone));
  const [error, setError] = useState<string | null>(null);
  const reschedule = useRescheduleAppointment();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await reschedule.mutateAsync({
        id: appointment.id,
        version: appointment.version,
        input: { start_at: localInputToZoned(startLocal, timezone) },
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const code = err.body.code ?? err.status;
        const msg = err.body.message ?? err.message;
        setError(`${code}: ${msg}`);
      } else {
        setError((err as Error).message);
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            Change the start time. Server checks <code>If-Match: &quot;{appointment.version}&quot;</code> for
            optimistic locking.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start-at">New start time ({timezone})</Label>
            <Input
              id="start-at"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={reschedule.isPending}>
              {reschedule.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
