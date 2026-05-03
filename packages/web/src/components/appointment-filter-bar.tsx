'use client';

import { useTechnicians } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AppointmentFilters {
  from: string;
  to: string;
  status?: string;
  technician_id?: string;
}

interface Props {
  value: AppointmentFilters;
  onChange: (next: AppointmentFilters) => void;
}

export function AppointmentFilterBar({ value, onChange }: Props) {
  const technicians = useTechnicians();

  return (
    <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          value={value.from.slice(0, 10)}
          onChange={(e) => onChange({ ...value, from: new Date(e.target.value).toISOString() })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-to">To</Label>
        <Input
          id="filter-to"
          type="date"
          value={value.to.slice(0, 10)}
          onChange={(e) => onChange({ ...value, to: new Date(e.target.value).toISOString() })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          value={value.status ?? 'all'}
          onValueChange={(v) =>
            onChange({ ...value, status: v === 'all' ? undefined : v })
          }
        >
          <SelectTrigger id="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No-show</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-tech">Technician</Label>
        <Select
          value={value.technician_id ?? 'all'}
          onValueChange={(v) =>
            onChange({ ...value, technician_id: v === 'all' ? undefined : v })
          }
        >
          <SelectTrigger id="filter-tech">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any technician</SelectItem>
            {technicians.data?.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.first_name} {t.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
