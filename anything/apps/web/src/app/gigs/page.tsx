'use client';

/**
 * Public gig listing ("Browse Gigs" — the work half of "Browse Gigs &
 * Events"). Anyone can browse — signed out, PARTY, TALENT or VENUE; applying
 * happens on the gig detail page and requires a Talent account (the API
 * enforces it; the banner here says it up front). Supports ?event=<id> as
 * the /events "open roles" deep link.
 *
 * The role/search state is client-local like the venues directory; the event
 * param is read post-mount (not useSearchParams — see the settings page note
 * on the Suspense hang under nonce-CSP + force-dynamic).
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Search,
  MapPin,
  Clock,
  Loader2,
  Music,
  BriefcaseBusiness,
  Zap,
  X,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type ApiGig,
  formatDate,
  formatRate,
  formatTime,
  gigUrgency,
} from '@/lib/gigs';

const ROLES = ['DJ', 'Go-Go Dancer', 'Bartender', 'Bottle Server', 'Photographer', 'Security'];

interface GigsPage {
  gigs: ApiGig[];
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

export default function PublicGigsPage() {
  const [term, setTerm] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventReady, setEventReady] = useState(false);
  const q = useDebounced(term.trim(), 300);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('event');
    // UUID-shaped only — anything else is ignored, not sent to the API.
    if (param && /^[0-9a-f-]{36}$/i.test(param)) setEventId(param);
    setEventReady(true);
  }, []);

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );

  const clearEvent = () => {
    setEventId(null);
    window.history.replaceState(null, '', '/gigs');
  };

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['public-gigs', q, roles.join(','), eventId],
    enabled: eventReady,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam) });
      if (q.length >= 2) params.set('q', q);
      if (roles.length > 0) params.set('roles', roles.join(','));
      if (eventId) params.set('event', eventId);
      const res = await fetch(`/api/gigs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<GigsPage>;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const gigs = data?.pages.flatMap((page) => page.gigs) ?? [];

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
              placeholder="Search gigs by title, venue, or role…"
              aria-label="Search gigs"
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
            />
          </div>
          <Link
            href="/events"
            className="hidden sm:block text-sm font-semibold text-white/50 hover:text-white transition-colors"
          >
            Events
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-[#00FFCC] text-xs font-black uppercase tracking-widest mb-2">
            <BriefcaseBusiness className="w-4 h-4" /> Work the night
          </div>
          <h1 className="text-3xl font-black tracking-tight">Browse Gigs</h1>
          <p className="text-white/40 text-sm mt-2 max-w-xl">
            Open roles at real NYC nights. Anyone can browse —{' '}
            <Link href="/account/signup" className="text-[#00FFCC]/80 hover:underline">
              a Talent account
            </Link>{' '}
            is required to apply.
          </p>
        </header>

        {/* Role chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {ROLES.map((role) => {
            const active = roles.includes(role);
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  active
                    ? 'bg-[#00FFCC]/15 border-[#00FFCC]/40 text-[#00FFCC]'
                    : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
                }`}
              >
                {role}
              </button>
            );
          })}
          {eventId && (
            <button
              type="button"
              onClick={clearEvent}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#00FFCC]/10 border border-[#00FFCC]/30 text-[#00FFCC] hover:bg-[#00FFCC]/20 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Roles for one event — clear
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {isPending || !eventReady ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
          </div>
        ) : gigs.length === 0 ? (
          <div className="text-center py-24">
            <BriefcaseBusiness className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/40">No open gigs match.</p>
            <p className="text-xs text-white/40 mt-1">
              Try clearing a filter — venues post new roles all the time.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {gigs.map((gig) => {
                const urgency = gigUrgency(gig);
                return (
                  <Link
                    key={gig.id}
                    href={`/gigs/${gig.id}`}
                    className="flex items-center gap-4 rounded-2xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/25 transition-colors p-4 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00FFCC]/20 to-purple-500/10 flex items-center justify-center flex-shrink-0 text-lg font-black text-[#00FFCC]/60 select-none">
                      {(gig.venue_name ?? gig.title).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {urgency && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase flex-shrink-0 ${
                              urgency === 'HOT'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/25'
                            }`}
                          >
                            {urgency === 'HOT' && <Zap className="w-2 h-2 inline -mt-0.5 mr-0.5 fill-current" />}
                            {urgency}
                          </span>
                        )}
                        <h2 className="text-sm font-bold text-white group-hover:text-[#00FFCC] transition-colors truncate">
                          {gig.title}
                        </h2>
                      </div>
                      <p className="text-xs text-white/40 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="flex items-center gap-1">
                          <Music className="w-3 h-3" />
                          {gig.role_needed || 'Nightlife Talent'}
                          {gig.venue_name ? ` · ${gig.venue_name}` : ''}
                        </span>
                        {gig.venue_neighborhood && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {gig.venue_neighborhood}
                          </span>
                        )}
                        {gig.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(gig.start_time)} · {formatTime(gig.start_time)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-[#00FFCC]">{formatRate(gig)}</p>
                      <p className="text-[10px] text-white/45 mt-0.5 group-hover:text-white/70 transition-colors">
                        View &amp; Apply
                      </p>
                    </div>
                  </Link>
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
                  {isFetchingNextPage ? 'Loading…' : 'Load more gigs'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
