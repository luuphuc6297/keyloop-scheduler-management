'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarOff, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDealership, useAppointments, useCancelAppointment } from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { errorToToast } from '@/lib/error-messages';
import { formatRange } from '@/lib/format';
import type { Appointment } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingDialog } from '@/components/booking-dialog';
import { RescheduleDialog } from '@/components/reschedule-dialog';
import { AppointmentFilterBar, type AppointmentFilters } from '@/components/appointment-filter-bar';
import { toast } from 'sonner';

export default function AppointmentsPage() {
  const dealership = useDealership();
  const tz = dealership.data?.timezone ?? 'UTC';

  const [bookingOpen, setBookingOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const defaultToDate = new Date(today);
  defaultToDate.setDate(defaultToDate.getDate() + 30);
  const defaultTo = defaultToDate.toISOString();

  const [filters, setFilters] = useState<AppointmentFilters>({
    from: defaultFrom,
    to: defaultTo,
  });

  const { data, isLoading, error } = useAppointments({ ...filters, limit: 100 });
  const cancel = useCancelAppointment();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={dealership.data ? `${dealership.data.name} — ${tz}` : 'Loading dealership…'}
        actions={
          <Button onClick={() => setBookingOpen(true)}>
            <Plus className="h-4 w-4" />
            Book appointment
          </Button>
        }
      />

      <AppointmentFilterBar value={filters} onChange={setFilters} />

      {isLoading ? (
        <Card className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>
      ) : error ? (
        <Card className="p-6 text-sm text-danger">
          Failed to load: {(error as Error).message}
        </Card>
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No appointments in this range"
          description="Adjust the filters or book a new appointment."
          action={
            <Button onClick={() => setBookingOpen(true)}>
              <Plus className="h-4 w-4" />
              Book appointment
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
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
              <AnimatePresence initial={false}>
                {data.data.map((row) => (
                  <motion.tr
                    key={row.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/dashboard/appointments/${row.id}`}
                        className="hover:underline"
                      >
                        {formatRange(row.time_range, tz)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.status as 'confirmed' | 'completed' | 'cancelled' | 'no-show'}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">v{row.version}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
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
                            try {
                              await cancel.mutateAsync({ id: row.id, version: row.version });
                              toast.success('Appointment cancelled');
                            } catch (err) {
                              if (err instanceof ApiClientError) {
                                const t = errorToToast(err);
                                toast[t.variant](t.title, { description: t.detail });
                              } else {
                                toast.error('Cancel failed', { description: (err as Error).message });
                              }
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <BookingDialog open={bookingOpen} timezone={tz} onClose={() => setBookingOpen(false)} />
      {rescheduling ? (
        <RescheduleDialog
          appointment={rescheduling}
          timezone={tz}
          onClose={() => setRescheduling(null)}
        />
      ) : null}
    </div>
  );
}
