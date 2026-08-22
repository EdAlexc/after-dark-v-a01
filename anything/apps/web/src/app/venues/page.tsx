'use client';

/**
 * Public venue directory (S19 — §6.3: party people "browse venues to book
 * for private parties"; every signed-out visitor can explore too). Consumes
 * the public GET /api/venues projection — public columns only.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, Building2, MapPin, Users, Loader2, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VenueCard {
  id: string;
  venue_name: string;
  neighborhood: string | null;
  description: string | null;
  venue_type: string | null;
  capacity: number | null;
  music_genres: string[] | null;
  avatar_url: string | null;
  rating: string | number | null;
  rating_count: number | null;
}

interface VenuesPage {
  venues: VenueCard[];
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

export default function VenuesPage() {
  const [term, setTerm] = useState('');
  const q = useDebounced(term.trim(), 300);

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['venues-directory', q],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam) });
      if (q.length >= 2) params.set('q', q);
      const res = await fetch(`/api/venues?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load venues');
      return res.json() as Promise<VenuesPage>;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const venues = data?.pages.flatMap((page) => page.venues) ?? [];

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
              placeholder="Search venues by name, vibe, or neighborhood…"
              aria-label="Search venues"
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
            />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[#00FFCC] text-xs font-black uppercase tracking-widest mb-2">
            <PartyPopper className="w-4 h-4" /> Host your night
          </div>
          <h1 className="text-3xl font-black tracking-tight">Discover Venues</h1>
          <p className="text-white/40 text-sm mt-2 max-w-xl">
            Browse NYC clubs, lounges, and bars — and inquire directly about booking one for your
            private party.
          </p>
        </header>

        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-[#00FFCC] animate-spin" />
          </div>
        ) : venues.length === 0 ? (
          <div className="text-center py-24">
            <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-bold text-white/40">
              {q.length >= 2 ? `No venues match “${q}”.` : 'No venues listed yet.'}
            </p>
            <p className="text-xs text-white/25 mt-1">
              Venues appear here as soon as they complete their profile.
            </p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {venues.map((venue) => (
                <Link
                  key={venue.id}
                  href={`/venues/${venue.id}`}
                  className="rounded-2xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/25 transition-colors overflow-hidden group flex flex-col"
                >
                  <div className="h-28 bg-gradient-to-br from-[#00FFCC]/10 via-[#1E1E1E] to-purple-500/10 flex items-center justify-center">
                    {venue.avatar_url ? (
                      <img
                        src={venue.avatar_url}
                        alt=""
                        className="w-16 h-16 rounded-2xl object-cover border border-white/10"
                      />
                    ) : (
                      <Building2 className="w-10 h-10 text-[#00FFCC]/40" />
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight">
                        {venue.venue_name}
                      </h2>
                      {Number(venue.rating) > 0 && (
                        <span className="text-xs font-bold text-white/60 flex-shrink-0">
                          ★ {Number(venue.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {venue.venue_type && <span>{venue.venue_type}</span>}
                      {venue.neighborhood && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {venue.neighborhood}
                        </span>
                      )}
                      {venue.capacity ? (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {venue.capacity}
                        </span>
                      ) : null}
                    </p>
                    {venue.description && (
                      <p className="text-xs text-white/35 mt-2 line-clamp-2 leading-relaxed">
                        {venue.description}
                      </p>
                    )}
                    {Array.isArray(venue.music_genres) && venue.music_genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {venue.music_genres.slice(0, 3).map((genre) => (
                          <span
                            key={genre}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {hasNextPage && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more venues'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
