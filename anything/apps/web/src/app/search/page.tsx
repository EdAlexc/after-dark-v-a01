'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search,
  Briefcase,
  Zap,
  Clock,
  MapPin,
  DollarSign,
  MessageSquare,
  ArrowLeft,
  Building2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRateBand, type SearchResponse } from '@/components/GlobalSearch';
import { useMyRole } from '@/lib/use-my-role';

/**
 * URL-addressable search results (S5) — /search?q=…&type=gigs|talent.
 * Deep links survive refresh per the PRD routing architecture; the API it
 * consumes is public, so this page is too (signed-out users can explore).
 */
function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const urlType = searchParams.get('type');
  const [term, setTerm] = useState(urlQuery);

  useEffect(() => {
    setTerm(urlQuery);
  }, [urlQuery]);

  const type =
    urlType === 'gigs' || urlType === 'talent' || urlType === 'venues' ? urlType : undefined;
  const active = urlQuery.trim().length >= 2;
  // S19 (F8): CTAs depend on who is looking — only venues get "Message talent".
  const { role: myRole } = useMyRole();

  const { data, isPending } = useQuery({
    queryKey: ['search-results', urlQuery, type ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({ q: urlQuery, limit: '20' });
      if (type) params.set('type', type);
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json() as Promise<SearchResponse>;
    },
    enabled: active,
    placeholderData: keepPreviousData,
  });

  const submit = () => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    const params = new URLSearchParams({ q: trimmed });
    if (type) params.set('type', type);
    router.replace(`/search?${params.toString()}`);
  };

  const setType = (next: 'gigs' | 'talent' | 'venues' | undefined) => {
    const params = new URLSearchParams({ q: urlQuery });
    if (next) params.set('type', next);
    router.replace(`/search?${params.toString()}`);
  };

  const gigs = data?.gigs ?? [];
  const talent = data?.talent ?? [];
  const venues = data?.venues ?? [];

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* Top bar */}
      <nav className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder="Search gigs or talent…"
              aria-label="Search gigs or talent"
              className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
            />
          </div>
          <Button
            size="sm"
            onClick={submit}
            className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold"
          >
            Search
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Type filter */}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors mr-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>
          {(
            [
              [undefined, 'All'],
              ['gigs', 'Gigs'],
              ['talent', 'Talent'],
              ['venues', 'Venues'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              onClick={() => setType(value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                type === value
                  ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30'
                  : 'text-white/40 border-white/10 hover:text-white hover:border-white/25'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {!active ? (
          <p className="text-sm text-white/40">Type at least two characters to search.</p>
        ) : isPending ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#00FFCC]/20 border-t-[#00FFCC] rounded-full animate-spin" />
          </div>
        ) : gigs.length === 0 && talent.length === 0 && venues.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-bold text-white/40">No matches for “{urlQuery}”.</p>
            <p className="text-xs text-white/25 mt-1">
              Try a different word — search covers gig titles, descriptions, stage names, bios,
              and venues.
            </p>
          </div>
        ) : (
          <>
            {gigs.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Gigs · {gigs.length}
                </h2>
                <div className="space-y-2.5">
                  {gigs.map((gig) => (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.id}`}
                      className="flex items-center gap-4 p-4 rounded-xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/20 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-[#00FFCC]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white group-hover:text-[#00FFCC] transition-colors truncate">
                          {gig.title}
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40 mt-0.5">
                          {gig.role_needed && <span>{gig.role_needed}</span>}
                          {gig.venue_name && <span>· {gig.venue_name}</span>}
                          {gig.venue_neighborhood && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {gig.venue_neighborhood}
                            </span>
                          )}
                          {gig.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(gig.start_time).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      {Number(gig.base_rate) > 0 && (
                        <span className="text-base font-black text-white flex-shrink-0">
                          ${Number(gig.base_rate)}
                          <span className="text-xs font-normal text-white/40">/hr</span>
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {talent.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Talent · {talent.length}
                </h2>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {talent.map((person) => (
                    <div
                      key={person.id}
                      className="p-4 rounded-xl bg-[#1E1E1E] border border-white/5 hover:border-white/10 transition-colors"
                    >
                      {/* S20: talent results deep-link to the public profile. */}
                      <Link href={`/talent/${person.id}`} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-5 h-5 text-[#00FFCC]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white truncate">
                            {person.stage_name}
                            {person.available_tonight ? (
                              <span className="ml-1.5 text-[9px] font-black text-[#00FFCC] align-middle">
                                TONIGHT
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-white/40 truncate">
                            {[person.primary_role, person.neighborhood]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </Link>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs font-bold text-white/50 flex items-center gap-1">
                          {formatRateBand(person.hourly_rate_min, person.hourly_rate_max) && (
                            <>
                              <DollarSign className="w-3 h-3" />
                              {formatRateBand(person.hourly_rate_min, person.hourly_rate_max)}
                            </>
                          )}
                        </span>
                        {/* S19 (F8): messaging talent is a venue capability —
                            the CTA used to send every role to the venue inbox.
                            S20: it lands on the profile, whose Message button
                            opens the real thread (talent_id anchor). */}
                        {myRole === 'VENUE' && (
                          <Link href={`/talent/${person.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/10 text-white/60 hover:text-white text-xs h-7 flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3 h-3" /> Message
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {venues.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Venues · {venues.length}
                </h2>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {venues.map((venue) => (
                    <Link
                      key={venue.id}
                      href={`/venues/${venue.id}`}
                      className="p-4 rounded-xl bg-[#1E1E1E] border border-white/5 hover:border-[#00FFCC]/20 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-[#00FFCC]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white truncate group-hover:text-[#00FFCC] transition-colors">
                            {venue.venue_name}
                          </p>
                          <p className="text-xs text-white/40 truncate">
                            {[venue.venue_type, venue.neighborhood].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 text-xs text-white/50">
                        <span className="flex items-center gap-1">
                          {venue.capacity ? (
                            <>
                              <Users className="w-3 h-3" /> Up to {venue.capacity}
                            </>
                          ) : null}
                        </span>
                        {Number(venue.rating) > 0 && (
                          <span className="font-bold">★ {Number(venue.rating).toFixed(1)}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}
