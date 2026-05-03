'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  useAppointment,
  useAppointmentHistory,
  useCancelAppointment,
  useDealership,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { errorToToast } from '@/lib/error-messages';
import { formatRange } from '@/lib/format';
import type { Appointment } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HistoryTimeline } from '@/components/history-timeline';
import { RescheduleDialog } from '@/components/reschedule-dialog';

export default function AppointmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const router = useRouter();

  const dealership = useDealership();
  const tz = dealership.data?.timezone ?? 'UTC';
  const appointment = useAppointment(id);
  const history = useAppointmentHistory(id);
  const cancel = useCancelAppointment();
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  if (appointment.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (appointment.error || !appointment.data) {
    return (
      <Card className="p-6 text-sm text-danger">
        {(appointment.error as Error)?.message ?? 'Appointment not found'}
      </Card>
    );
  }

  const a = appointment.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/appointments" className="hover:text-foreground">
          Appointments
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-mono text-xs">{a.id.slice(0, 8)}…</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-2xl font-semibold">
              {formatRange(a.time_range, tz)}
            </h2>
            <Badge variant={a.status as 'confirmed' | 'completed' | 'cancelled' | 'no-show'}>
              {a.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            v{a.version} · ID {a.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={a.status !== 'confirmed'}
            onClick={() => setRescheduling(a)}
          >
            Reschedule
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={a.status !== 'confirmed' || cancel.isPending}
            onClick={async () => {
              try {
                await cancel.mutateAsync({ id: a.id, version: a.version });
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Field label="Customer" value={a.customer_id.slice(0, 8) + '…'} mono />
          <Field label="Vehicle" value={a.vehicle_id.slice(0, 8) + '…'} mono />
          <Field label="Service" value={a.service_type_id.slice(0, 8) + '…'} mono />
          <Field label="Technician" value={a.technician_id.slice(0, 8) + '…'} mono />
          <Field label="Bay" value={a.bay_id.slice(0, 8) + '…'} mono />
          <Field label="Created" value={new Date(a.created_at).toLocaleString()} />
          <Field label="Updated" value={new Date(a.updated_at).toLocaleString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : history.data && history.data.length > 0 ? (
            <HistoryTimeline entries={history.data} timezone={tz} />
          ) : (
            <p className="text-sm text-muted-foreground">No history entries.</p>
          )}
        </CardContent>
      </Card>

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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? 'mt-0.5 font-mono text-xs' : 'mt-0.5 text-sm'}>{value}</div>
    </div>
  );
}
