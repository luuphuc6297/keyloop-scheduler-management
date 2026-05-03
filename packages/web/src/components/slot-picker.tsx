'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { DateTime } from 'luxon';
import type { AvailabilitySlot } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface SlotPickerProps {
  slots: AvailabilitySlot[];
  /** ISO string of the slot the user has currently selected (clicked). */
  selectedStartAt: string | null;
  /** ISO string of an existing booking's slot — rendered as a "current" tile. */
  currentStartAt?: string;
  /** Dealership IANA timezone — slot times are localized to this. */
  timezone: string;
  loading?: boolean;
  /** Cap rendered slots to keep the panel scrollable; default 90 (~3 weeks of half-day windows). */
  maxSlots?: number;
  emptyMessage?: string;
  onSelect: (startAt: string) => void;
}

interface DayGroup {
  /** `yyyy-MM-dd` in the dealership tz, used as the React key. */
  dateKey: string;
  /** Display header, e.g. `Mon, May 4`. */
  label: string;
  /** Whether the date is today in the dealership tz. */
  isToday: boolean;
  slots: AvailabilitySlot[];
  /** Count of slots a user can actually click. */
  openCount: number;
  /** Total slots in the day window (open + booked). */
  totalCount: number;
}

/**
 * Slot grid grouped by day.
 *
 * Why grouped instead of a flat grid: with 14 days × ~14 half-hour slots a
 * flat list looks like a wall of timestamps. Grouping makes the day boundary
 * visible at a glance, and lets each pill show only the time-of-day (e.g.
 * `10:00 AM`) instead of the full `Mon May 4, 10:00 AM` string we used before.
 */
export function SlotPicker({
  slots,
  selectedStartAt,
  currentStartAt,
  timezone,
  loading = false,
  maxSlots = 90,
  emptyMessage = 'No open slots in this window.',
  onSelect,
}: SlotPickerProps) {
  const groups = useMemo<DayGroup[]>(() => {
    const today = DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd');
    const buckets = new Map<string, DayGroup>();
    for (const slot of slots.slice(0, maxSlots)) {
      const dt = DateTime.fromISO(slot.start_at, { setZone: true }).setZone(timezone);
      const key = dt.toFormat('yyyy-LL-dd');
      const existing = buckets.get(key);
      if (existing) {
        existing.slots.push(slot);
        existing.totalCount += 1;
        if (slot.status !== 'booked') existing.openCount += 1;
        continue;
      }
      buckets.set(key, {
        dateKey: key,
        label: dt.toFormat('ccc, LLL d'),
        isToday: key === today,
        slots: [slot],
        openCount: slot.status === 'booked' ? 0 : 1,
        totalCount: 1,
      });
    }
    return Array.from(buckets.values()).sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  }, [slots, timezone, maxSlots]);

  if (loading) {
    return (
      <div className="space-y-3 rounded-xl border bg-surface-elevated p-3">
        {Array.from({ length: 3 }).map((_, dayIdx) => (
          <div key={dayIdx} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((__, slotIdx) => (
                <Skeleton key={slotIdx} className="h-9 w-20 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border bg-surface-elevated p-3">
      {groups.map((group) => (
        <div key={group.dateKey}>
          <div className="mb-2 flex items-baseline gap-2 px-1">
            <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
            {group.isToday ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Today
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {group.openCount === group.totalCount
                ? `${group.totalCount} slot${group.totalCount === 1 ? '' : 's'}`
                : `${group.openCount} of ${group.totalCount} open`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 px-1">
            {group.slots.map((slot) => {
              const isSelected = selectedStartAt === slot.start_at;
              const isCurrent = currentStartAt === slot.start_at;
              // `status` is only present when the request asked for it; treat
              // legacy responses (no field) as available for back-compat.
              const isBooked = slot.status === 'booked' && !isCurrent;
              const time = DateTime.fromISO(slot.start_at, { setZone: true })
                .setZone(timezone)
                .toFormat('h:mm a');

              if (isBooked) {
                // Disabled tile — visible so user sees demand, but not clickable.
                // No motion wrapper because hover/press animation would imply it's
                // interactive; we don't want to mislead.
                return (
                  <button
                    key={slot.start_at + slot.technician_id}
                    type="button"
                    disabled
                    aria-disabled
                    title="Already booked"
                    className="inline-flex min-w-[5.5rem] cursor-not-allowed items-center justify-center rounded-full border border-dashed border-border bg-muted/40 px-3.5 py-2 text-sm font-medium text-muted-foreground line-through decoration-1"
                  >
                    {time}
                  </button>
                );
              }

              return (
                <motion.button
                  key={slot.start_at + slot.technician_id}
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelect(slot.start_at)}
                  className={
                    'group relative inline-flex min-w-[5.5rem] items-center justify-center rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ' +
                    (isSelected
                      ? 'border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/30 ring-2 ring-primary/30 ring-offset-1 ring-offset-surface-elevated'
                      : isCurrent
                        ? 'border-dashed border-primary/60 bg-primary/5 text-primary'
                        : 'border-border bg-surface text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary')
                  }
                  title={isCurrent ? 'Current slot' : undefined}
                  aria-pressed={isSelected}
                >
                  {time}
                  {isCurrent && !isSelected ? (
                    <span className="absolute -top-2 right-2 rounded-full bg-primary px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                      now
                    </span>
                  ) : null}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
