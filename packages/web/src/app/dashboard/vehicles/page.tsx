'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Car } from 'lucide-react';
import { useVehicleSearch } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function VehiclesPage() {
  const [vin, setVin] = useState('');
  const vehicles = useVehicleSearch(vin);

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" description="Look up a vehicle by VIN fragment." />

      <div className="space-y-1.5">
        <Label htmlFor="vin">VIN</Label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="vin"
            placeholder="Type at least 2 characters of the VIN…"
            className="pl-9 font-mono uppercase"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
          />
        </div>
      </div>

      {vehicles.isLoading ? (
        <Card className="p-4">
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      ) : !vehicles.data || vehicles.data.length === 0 ? (
        <EmptyState icon={Car} title="No matches" description={`No vehicles found for "${vin}".`} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">VIN</th>
                <th className="px-4 py-2">Make</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Year</th>
                <th className="px-4 py-2">Customer</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.data.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{v.vin}</td>
                  <td className="px-4 py-3">{v.make}</td>
                  <td className="px-4 py-3">{v.model}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.year}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${v.customer_id}`}
                      className="text-primary hover:underline"
                    >
                      View customer
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
