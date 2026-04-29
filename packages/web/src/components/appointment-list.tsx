'use client';

import { useState } from 'react';
import { ApiClientError } from '@/lib/api';
import { useAppointments, useCancelAppointment } from '@/lib/queries';
import type { Appointment } from '@/lib/types';
import { formatRange } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { RescheduleDialog } from './reschedule-dialog';

interface Props {
  timezone: string;
}

const STATUS_BADGE: Record<Appointment['status'], string> = {
  confirmed: 'bg-emerald-100 text-emerald-900',
  completed: 'bg-blue-100 text-blue-900',
  cancelled: 'bg-zinc-200 text-zinc-700 line-through',
  no_show: 'bg-amber-100 text-amber-900',
};

export function AppointmentList({ timezone }: Props) {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 30);
  const to = toDate.toISOString();

  const { data, isLoading, error } = useAppointments({ from, to, limit: 100 });
  const cancel = useCancelAppointment();
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading appointments…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>;
  }
  if (!data || data.data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No upcoming appointments. Click <strong>Book appointment</strong> to create one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Version</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{formatRange(row.time_range, timezone)}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">v{row.version}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={row.status !== 'confirmed'}
                    onClick={() => setRescheduling(row)}
                  >
                    Reschedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={row.status !== 'confirmed' || cancel.isPending}
                    onClick={async () => {
                      setRowError(null);
                      try {
                        await cancel.mutateAsync({ id: row.id, version: row.version });
                      } catch (err) {
                        const msg =
                          err instanceof ApiClientError
                            ? `${err.body.code ?? err.status}: ${err.body.message ?? err.message}`
                            : (err as Error).message;
                        setRowError({ id: row.id, message: msg });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {rowError?.id === row.id ? (
                  <p className="mt-1 text-xs text-destructive">{rowError.message}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rescheduling ? (
        <RescheduleDialog
          appointment={rescheduling}
          timezone={timezone}
          onClose={() => setRescheduling(null)}
        />
      ) : null}
    </div>
  );
}
