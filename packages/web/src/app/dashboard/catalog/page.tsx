'use client';

import { useBays, useBusinessHours, useServiceTypes, useTechnicians } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CatalogPage() {
  const services = useServiceTypes();
  const technicians = useTechnicians();
  const bays = useBays();
  const hours = useBusinessHours();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Read-only browse of dealership configuration. Edit via the admin tooling."
      />

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="technicians">Technicians</TabsTrigger>
          <TabsTrigger value="bays">Bays</TabsTrigger>
          <TabsTrigger value="hours">Business hours</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          {services.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Duration</th>
                    <th className="px-4 py-2">Buffer</th>
                    <th className="px-4 py-2">Required skill</th>
                  </tr>
                </thead>
                <tbody>
                  {services.data?.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.duration_minutes} min</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.buffer_minutes} min</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.required_skill_id ? s.required_skill_id.slice(0, 8) + '…' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="technicians">
          {technicians.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Skills</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {technicians.data?.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {t.first_name} {t.last_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{t.employee_code}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {t.skills.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={t.is_active ? 'success' : 'secondary'}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bays">
          {bays.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {bays.data?.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.name}</span>
                    <Badge variant={b.is_active ? 'success' : 'secondary'}>
                      {b.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="hours">
          {hours.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Standard hours
                </div>
                <ul className="divide-y divide-border">
                  {DAY_OF_WEEK.map((label, dow) => {
                    const row = hours.data?.hours.find((h) => h.day_of_week === dow);
                    return (
                      <li key={dow} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground">
                          {row ? `${row.open_time}–${row.close_time}` : 'Closed'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card>
                <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Exceptions
                </div>
                {(hours.data?.exceptions ?? []).length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No upcoming holidays or special hours.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {hours.data!.exceptions.map((ex) => (
                      <li key={ex.date} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium">{ex.date}</span>
                        <span className="text-muted-foreground">
                          {ex.is_closed
                            ? 'Closed'
                            : `${ex.override_open}–${ex.override_close}`}
                          {ex.reason ? ` · ${ex.reason}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
