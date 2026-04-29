'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDealership } from '@/lib/queries';
import { AppointmentList } from '@/components/appointment-list';
import { BookingDialog } from '@/components/booking-dialog';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const dealership = useDealership();
  const [bookingOpen, setBookingOpen] = useState(false);
  const tz = dealership.data?.timezone ?? 'UTC';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Upcoming appointments</h2>
          <p className="text-sm text-muted-foreground">
            {dealership.data ? `${dealership.data.name} — ${tz}` : 'Loading dealership…'}
          </p>
        </div>
        <Button onClick={() => setBookingOpen(true)}>
          <Plus className="h-4 w-4" />
          Book appointment
        </Button>
      </div>

      <AppointmentList timezone={tz} />

      <BookingDialog open={bookingOpen} timezone={tz} onClose={() => setBookingOpen(false)} />
    </div>
  );
}
