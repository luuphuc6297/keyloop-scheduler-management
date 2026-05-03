'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Pencil, XCircle, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppointmentHistoryEntry } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';

const FIELD_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  created:     { icon: CheckCircle2, label: 'Created',     color: 'text-status-confirmed' },
  rescheduled: { icon: Pencil,       label: 'Rescheduled', color: 'text-info' },
  cancelled:   { icon: XCircle,      label: 'Cancelled',   color: 'text-status-cancelled' },
};

const DEFAULT_META = { icon: Clock, label: 'Updated', color: 'text-muted-foreground' };

interface Props {
  entries: AppointmentHistoryEntry[];
  timezone: string;
}

export function HistoryTimeline({ entries, timezone }: Props) {
  return (
    <ol className="space-y-3">
      {entries.map((entry, idx) => {
        const meta = FIELD_META[entry.field] ?? DEFAULT_META;
        const Icon = meta.icon;
        const date = new Date(entry.changed_at);
        return (
          <motion.li
            key={entry.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.2 }}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <div className={`rounded-full bg-muted p-1.5 ${meta.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {idx < entries.length - 1 ? <div className="mt-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{meta.label}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {entry.field}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {date.toLocaleString(undefined, { timeZone: timezone })} · by{' '}
                <span className="font-mono">{entry.changed_by.slice(0, 8)}…</span>
              </p>
              {entry.reason ? (
                <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{entry.reason}&rdquo;</p>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
