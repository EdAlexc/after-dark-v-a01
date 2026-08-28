'use client';

/**
 * Public event listings ("Browse Events" — the visitor/party-people half of
 * "Browse Gigs & Events"). Every audience can browse; the "open roles" chip
 * deep-links each event's gigs on the public gig listing, where applying
 * remains a Talent-account action. Same layout language as /venues.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Search,
  CalendarDays,
  MapPin,
  Building2,
  Loader2,
  Sparkles,
  Zap,
  BriefcaseBusiness,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatTime } from '@/lib/gigs';

interface EventCard {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  age_requirement: number;
  source_platform: string | null;
  venue_id: string;
  venue_name: string;
  venue_neighborhood: string | null;
  venue_type: string | null;
  venue_avatar_url: string | null;
  open_gig_count: number;
}

interface EventsPage {
  events: EventCard[];
  page: number;
  hasMore: boolean;
}

/** Debounce a changing value (same guard GlobalSearch uses). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function isTonight(iso: string): boolean {
  const start = new Date(iso).getTime();
  const now = Date.now();
  return start >= now - 6 * 3600 * 1000 && start < now + 24 * 3600 * 1000;
}

export default function EventsPage() {
  const [term, setTerm] = useState('');
  const q = useDebounced(term.trim(), 300);

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['events-directory', q],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam) });
      if (q.length >= 2) params.set('q', q);
      const res = await fetch(`/api/events?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load events');
      return res.json() as Promise<EventsPage>;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const events = data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Top bar */}
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search events by name, venue, or neighborhood…"
              aria-label="Search events"
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
            />
          </div>
          <Link
            href="/gigs"
            className="hidden sm:block text-sm font-semibold text-white/50 hover:text-white transition-colors"
          >
            Gigs
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[#00FFCC] text-xs font-black uppercase tracking-widest mb-2">
            <Sparkles className="w-4 h-4" /> What&apos;s on
          </div>
          <h1 className="text-3xl font-black tracking-tight">Discover Events</h1>
          <p className="text-white/40 text-sm mt-2 max-w-xl">
            Real nights across NYC — browse who&apos;s playing and where. Working a night instead?
            Each event lists its open roles.
          </p>
        </header>

        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24">
            <CalendarDays className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/40">
              {q.length >= 2 ? `No events match “${q}”.` : 'No upcoming events listed yet.'}
            </p>
            <p className="text-xs text-white/25 mt-1">
              Events appear here as venues publish their calendars.
            </p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => {
                const tonight = isTonight(event.start_time);
                return (
                  <div
                    key={event.id}
                    className="rounded-2xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/25 transition-colors overflow-hidden group flex flex-col"
                  >
                    <div className="h-24 bg-gradient-to-br from-[#00FFCC]/10 via-[#1E1E1E] to-purple-500/10 relative flex items-center justify-center">
                      {event.venue_avatar_url ? (
                        <img
                          src={event.venue_avatar_url}
                          alt=""
                          className="w-14 h-14 rounded-2xl object-cover border border-white/10"
                        />
                      ) : (
                        <CalendarDays className="w-9 h-9 text-[#00FFCC]/40" />
                      )}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        {tonight && (
                          <span className="bg-[#00FFCC] text-black px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5 fill-current" /> Tonight
                          </span>
                        )}
                        {event.age_requirement >= 21 && (
                          <span className="bg-black/60 backdrop-blur px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/10 text-white/70">
                            21+
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h2 className="text-base font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight line-clamp-2">
                        {event.title}
                      </h2>
                      <p className="text-xs text-white/40 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={`/venues/${event.venue_id}`}
                          className="flex items-center gap-1 hover:text-white transition-colors"
                        >
                          <Building2 className="w-3 h-3" /> {event.venue_name}
                        </Link>
                        {event.venue_neighborhood && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {event.venue_neighborhood}
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-semibold text-white/60 mt-2 flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-[#00FFCC]" />
                        {formatDate(event.start_time)}
                        {formatTime(event.start_time) ? ` · ${formatTime(event.start_time)}` : ''}
                      </p>
                      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                        {event.open_gig_count > 0 ? (
                          <Link
                            href={`/gigs?event=${event.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00FFCC] hover:underline"
                          >
                            <BriefcaseBusiness className="w-3.5 h-3.5" />
                            {event.open_gig_count} open role
                            {event.open_gig_count === 1 ? '' : 's'}
                          </Link>
                        ) : (
                          <span className="text-xs text-white/25">Fully staffed</span>
                        )}
                        {event.source_platform && (
                          <span
                            className="text-[10px] text-white/20"
                            title="Public listing source"
                          >
                            via {event.source_platform}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasNextPage && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more events'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
