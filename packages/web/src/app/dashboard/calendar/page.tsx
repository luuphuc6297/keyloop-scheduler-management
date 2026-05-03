'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { DateTime } from 'luxon';
import { useAppointments, useBays, useDealership } from '@/lib/queries';
import type { Appointment } from '@/lib/types';
import { parseTimeRange } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const HOUR_PX = 56;
const START_HOUR = 7;
const END_HOUR = 19;

export default function CalendarPage() {
  const dealership = useDealership();
  const tz = dealership.data?.timezone ?? 'UTC';
  const bays = useBays();

  const [day, setDay] = useState(() => DateTime.now().setZone(tz).startOf('day'));

  const fromIso = day.toUTC().toISO()!;
  const toIso = day.plus({ days: 1 }).toUTC().toISO()!;

  const appointments = useAppointments({
    from: fromIso,
    to: toIso,
    status: 'confirmed',
    limit: 100,
  });

  const blocks = useMemo(() => {
    if (!appointments.data) return [] as PositionedBlock[];
    return appointments.data.data
      .map((a) => positionBlock(a, tz))
      .filter((b): b is PositionedBlock => b !== null);
  }, [appointments.data, tz]);

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Day view"
        description={`Confirmed appointments on ${day.toFormat('cccc, LLLL d, yyyy')} · ${tz}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDay(day.minus({ days: 1 }))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDay(DateTime.now().setZone(tz).startOf('day'))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDay(day.plus({ days: 1 }))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {appointments.isLoading || bays.isLoading ? (
        <Skeleton className="h-[600px] w-full" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `60px repeat(${bays.data?.length ?? 0}, minmax(160px, 1fr))`,
              minHeight: (END_HOUR - START_HOUR) * HOUR_PX,
            }}
          >
            {/* Time axis */}
            <div className="border-r border-border bg-muted/30">
              <div className="sticky top-0 h-9 border-b border-border bg-surface text-xs font-medium" />
              {hours.map((h) => (
                <div
                  key={h}
                  className="relative text-right text-[11px] text-muted-foreground"
                  style={{ height: HOUR_PX }}
                >
                  <span className="absolute right-2 top-0 -translate-y-1/2 bg-surface px-1">
                    {DateTime.fromObject({ hour: h }).toFormat('h a')}
                  </span>
                </div>
              ))}
            </div>

            {/* Bay columns */}
            {bays.data?.map((bay) => {
              const bayBlocks = blocks.filter((b) => b.appointment.bay_id === bay.id);
              return (
                <div key={bay.id} className="relative border-r border-border last:border-r-0">
                  <div className="sticky top-0 z-10 flex h-9 items-center border-b border-border bg-surface px-3 text-xs font-medium">
                    {bay.name}
                  </div>
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="border-b border-border/50"
                      style={{ height: HOUR_PX }}
                    />
                  ))}
                  {/* Appointment blocks */}
                  {bayBlocks.map((b) => (
                    <Tooltip key={b.appointment.id}>
                      <TooltipTrigger asChild>
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.18 }}
                          className="absolute left-1.5 right-1.5 cursor-pointer rounded-lg border border-status-confirmed/30 bg-status-confirmed/15 p-2 text-xs shadow-xs hover:bg-status-confirmed/25"
                          style={{ top: b.top + 36, height: Math.max(b.height, 24) }}
                        >
                          <Link
                            href={`/dashboard/appointments/${b.appointment.id}`}
                            className="block"
                          >
                            <div className="font-medium text-status-confirmed">
                              {DateTime.fromISO(b.lowerIso).setZone(tz).toFormat('h:mm a')}
                            </div>
                            <div className="truncate text-muted-foreground">
                              {b.appointment.id.slice(0, 8)}…
                            </div>
                          </Link>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {DateTime.fromISO(b.lowerIso).setZone(tz).toFormat('h:mm a')} –{' '}
                            {DateTime.fromISO(b.upperIso).setZone(tz).toFormat('h:mm a')}
                          </div>
                          <div className="text-xs">
                            <Badge variant="confirmed">{b.appointment.status}</Badge>
                          </div>
                          <div className="text-xs font-mono">{b.appointment.id}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

interface PositionedBlock {
  appointment: Appointment;
  top: number;
  height: number;
  lowerIso: string;
  upperIso: string;
}

function positionBlock(a: Appointment, tz: string): PositionedBlock | null {
  try {
    const { lower, upper } = parseTimeRange(a.time_range);
    const localLower = lower.setZone(tz);
    const localUpper = upper.setZone(tz);
    const dayStart = localLower.startOf('day').plus({ hours: START_HOUR });
    const minutesFromStart = localLower.diff(dayStart, 'minutes').minutes;
    const durationMinutes = localUpper.diff(localLower, 'minutes').minutes;
    if (minutesFromStart < -60 || minutesFromStart > (END_HOUR - START_HOUR) * 60) return null;
    return {
      appointment: a,
      top: (minutesFromStart / 60) * HOUR_PX,
      height: (durationMinutes / 60) * HOUR_PX,
      lowerIso: lower.toISO()!,
      upperIso: upper.toISO()!,
    };
  } catch {
    return null;
  }
}
