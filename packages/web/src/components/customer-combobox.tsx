'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useCustomers } from '@/lib/queries';
import type { Customer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface CustomerComboboxProps {
  value: { id: string; first_name: string; last_name: string; email: string | null } | null;
  onChange: (customer: Customer | null) => void;
  /** Max results to show in the dropdown. Default 8. */
  limit?: number;
  placeholder?: string;
}

/**
 * Searchable customer picker with full UX states:
 *   - empty + focused → show top 8 (allowEmpty mode on the hook)
 *   - 1 char → "Type at least 2 characters" hint
 *   - 2+ chars + loading → animated skeletons
 *   - 2+ chars + 0 results → empty state
 *   - 2+ chars + results → list with hover and pointer-cursor rows
 *   - selected → chip with name + email + clear (×) button, no dropdown
 *
 * Why the hint at 1 char: the API only fires at length >= 2 (in `useCustomers`),
 * so without the hint the user types one letter and sees nothing happen.
 */
export function CustomerCombobox({
  value,
  onChange,
  limit = 8,
  placeholder = 'Search by name or email…',
}: CustomerComboboxProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  // 200ms debounce — typing "Alice" without debounce fires 5 requests.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Always allow empty so the user gets a "browse" experience on focus —
  // they don't have to know to type something to see suggestions.
  const customers = useCustomers(debouncedQuery, { allowEmpty: true });

  const items = useMemo(() => (customers.data ?? []).slice(0, limit), [customers.data, limit]);

  // Click-outside to close the dropdown without losing focus on the page.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (value) {
    // Selected state — render as a chip-style summary card.
    return (
      <div className="flex items-center justify-between rounded-xl border bg-primary/5 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(value.first_name, value.last_name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {value.first_name} {value.last_name}
            </div>
            {value.email ? (
              <div className="truncate text-xs text-muted-foreground">{value.email}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground"
          aria-label="Change customer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="flex h-10 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-surface-elevated shadow-lg">
          {/* Hint when user has typed only 1 character */}
          {query.length === 1 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          ) : customers.isLoading ? (
            // Skeleton rows while fetching.
            <div className="space-y-1 p-1.5">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {debouncedQuery.length >= 2
                ? `No customers match "${debouncedQuery}".`
                : 'No customers in this dealership yet.'}
            </div>
          ) : (
            <ul className="py-1">
              {debouncedQuery.length === 0 ? (
                <li className="border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent customers
                </li>
              ) : null}
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Use mousedown so the input doesn't blur first and close the dropdown
                      // before the click registers.
                      e.preventDefault();
                      onChange(c);
                      setQuery('');
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-primary/5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(c.first_name, c.last_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {c.first_name} {c.last_name}
                      </div>
                      {c.email ? (
                        <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                      ) : null}
                    </div>
                    {c.phone ? (
                      <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {c.phone}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function initials(first: string, last: string): string {
  return `${first.charAt(0) ?? ''}${last.charAt(0) ?? ''}`.toUpperCase() || '?';
}
