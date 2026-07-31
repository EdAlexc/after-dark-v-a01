'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, Briefcase, Zap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Result shapes from GET /api/search (public columns only). */
interface GigHit {
  id: string;
  title: string;
  role_needed: string | null;
  start_time: string | null;
  base_rate: string | number | null;
  venue_name: string | null;
  venue_neighborhood: string | null;
}

interface TalentHit {
  id: string;
  stage_name: string;
  primary_role: string | null;
  neighborhood: string | null;
  hourly_rate_min: string | number | null;
  hourly_rate_max: string | number | null;
  available_tonight: boolean | null;
}

export interface SearchResponse {
  q: string;
  gigs: GigHit[];
  talent: TalentHit[];
}

/** Debounce a changing value (per-keystroke fetch guard). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function formatRateBand(
  min: string | number | null,
  max: string | number | null
): string | null {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isFinite(lo) && lo > 0 && Number.isFinite(hi) && hi > 0) return `$${lo}–$${hi}/hr`;
  if (Number.isFinite(lo) && lo > 0) return `$${lo}+/hr`;
  if (Number.isFinite(hi) && hi > 0) return `up to $${hi}/hr`;
  return null;
}

/**
 * Global "search gigs or talent" box (S5 / Backlog #7 — the wireframes' top
 * bar control, previously absent). Quick results in a dropdown; Enter (or
 * "View all") goes to the URL-addressable /search page.
 */
export default function GlobalSearch({
  className,
  compact,
}: {
  className?: string;
  /** Tighter paddings for the sidebar variant. */
  compact?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(term.trim(), 300);
  const active = debounced.length >= 2;

  const { data } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}&limit=4`);
      if (!res.ok) throw new Error('Search failed');
      return res.json() as Promise<SearchResponse>;
    },
    enabled: active,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Close when clicking anywhere outside.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const goToResults = () => {
    if (term.trim().length < 2) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  const hasHits = Boolean(data && (data.gigs.length > 0 || data.talent.length > 0));

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') goToResults();
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Search gigs or talent…"
          aria-label="Search gigs or talent"
          className={cn(
            'w-full bg-[#1A1A1A] border border-white/10 rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#00FFCC]/40 transition-colors',
            compact ? 'py-2' : 'py-2.5'
          )}
        />
      </div>

      {open && active && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl bg-[#1E1E1E] border border-white/10 shadow-2xl overflow-hidden">
          {!hasHits ? (
            <p className="px-4 py-3 text-xs text-white/40">No matches for “{debounced}”.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {data!.gigs.length > 0 && (
                <div className="py-1.5">
                  <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
                    Gigs
                  </p>
                  {data!.gigs.map((gig) => (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-[#00FFCC]/60 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-white truncate">
                          {gig.title}
                        </span>
                        <span className="block text-[11px] text-white/40 truncate">
                          {[gig.role_needed, gig.venue_name, gig.venue_neighborhood]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {Number(gig.base_rate) > 0 && (
                        <span className="text-xs font-black text-white/70 flex-shrink-0">
                          ${Number(gig.base_rate)}/hr
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
              {data!.talent.length > 0 && (
                <div className="py-1.5 border-t border-white/5">
                  <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
                    Talent
                  </p>
                  {data!.talent.map((talent) => (
                    <Link
                      key={talent.id}
                      href={`/search?q=${encodeURIComponent(talent.stage_name)}&type=talent`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 text-[#00FFCC]/60 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-white truncate">
                          {talent.stage_name}
                          {talent.available_tonight ? (
                            <span className="ml-1.5 text-[9px] font-black text-[#00FFCC]">
                              TONIGHT
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] text-white/40 truncate">
                          {[talent.primary_role, talent.neighborhood].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {formatRateBand(talent.hourly_rate_min, talent.hourly_rate_max) && (
                        <span className="text-[11px] font-bold text-white/50 flex-shrink-0">
                          {formatRateBand(talent.hourly_rate_min, talent.hourly_rate_max)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={goToResults}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-[#00FFCC] bg-[#00FFCC]/5 hover:bg-[#00FFCC]/10 border-t border-white/5 transition-colors"
          >
            View all results <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
