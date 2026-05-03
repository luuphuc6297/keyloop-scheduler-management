'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useCustomer, useVehiclesByCustomer, useAppointments } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { GdprAnonymizeDialog } from '@/components/gdpr-anonymize-dialog';

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const router = useRouter();
  const customer = useCustomer(id);
  const vehicles = useVehiclesByCustomer(id);
  const appointments = useAppointments({ customer_id: id ?? undefined, limit: 50 });
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);

  if (customer.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (customer.error || !customer.data) {
    return (
      <Card className="p-6 text-sm text-danger">
        {(customer.error as Error)?.message ?? 'Customer not found'}
      </Card>
    );
  }

  const c = customer.data;
  const isAnonymized = Boolean(c.anonymized_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/customers" className="hover:text-foreground">
          Customers
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-mono text-xs">{c.id.slice(0, 8)}…</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-2xl font-semibold">
              {c.first_name} {c.last_name}
            </h2>
            {isAnonymized ? <Badge variant="secondary">Anonymized</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {c.email ?? '—'} · {c.phone ?? 'No phone'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isAnonymized}
            onClick={() => setAnonymizeOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Anonymize (GDPR)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
          <CardDescription>
            {vehicles.data?.length ?? 0} vehicle{(vehicles.data?.length ?? 0) === 1 ? '' : 's'} on file
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vehicles.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : vehicles.data && vehicles.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {vehicles.data.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">
                      {v.year} {v.make} {v.model}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">VIN {v.vin}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No vehicles" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>{appointments.data?.data.length ?? 0} on record</CardDescription>
        </CardHeader>
        <CardContent>
          {appointments.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : appointments.data && appointments.data.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {appointments.data.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    href={`/dashboard/appointments/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.time_range}
                  </Link>
                  <Badge variant={a.status as 'confirmed' | 'completed' | 'cancelled' | 'no-show'}>
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No appointments" />
          )}
        </CardContent>
      </Card>

      <GdprAnonymizeDialog
        customerId={c.id}
        customerName={`${c.first_name} ${c.last_name}`}
        open={anonymizeOpen}
        onClose={() => setAnonymizeOpen(false)}
      />
    </div>
  );
}
