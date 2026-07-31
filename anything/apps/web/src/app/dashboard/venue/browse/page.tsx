'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search,
  MapPin,
  DollarSign,
  Bell,
  Building2,
  Music,
  X,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Heart,
  Filter,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types & Data ─────────────────────────────────────────────────────────────

/** Public talent-directory row served by GET /api/talent (P1.1). */
interface ApiTalent {
  id: string;
  stage_name: string;
  pronouns: string | null;
  neighborhood: string | null;
  bio: string | null;
  primary_role: string | null;
  genres_vibes: string[] | null;
  hourly_rate_min: string | number | null;
  hourly_rate_max: string | number | null;
  avatar_url: string | null;
  profile_completion_pct: number | null;
  /** S8 aggregates — server-computed, never client input. */
  rating: string | number | null;
  rating_count: number | null;
  trust_score: number | null;
  created_at: string;
}

interface TalentListResponse {
  talent: ApiTalent[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const ROLES = [
  'DJ',
  'Mixologist',
  'Security',
  'Go-Go Dancer',
  'Vocalist',
  'Photographer',
  'Bartender',
  'Host / MC',
];
const NEIGHBORHOODS = ['Brooklyn', 'Midtown', 'Chelsea', 'Queens', 'Williamsburg', 'Harlem', 'LES'];
const RATE_RANGE_DEFAULT: number[] = [20, 400];

function rateBand(t: ApiTalent): string | null {
  const min = t.hourly_rate_min === null ? null : Number(t.hourly_rate_min);
  const max = t.hourly_rate_max === null ? null : Number(t.hourly_rate_max);
  if (min !== null && max !== null) return `$${min.toFixed(0)}–$${max.toFixed(0)}`;
  if (min !== null) return `from $${min.toFixed(0)}`;
  if (max !== null) return `up to $${max.toFixed(0)}`;
  return null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TalentAvatar({ talent, className }: { talent: ApiTalent; className?: string }) {
  if (talent.avatar_url) {
    return (
      <img
        src={talent.avatar_url}
        alt={talent.stage_name}
        className={cn('w-full h-full object-cover', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'w-full h-full bg-gradient-to-br from-[#00FFCC]/20 via-[#1E1E1E] to-[#121212] flex items-center justify-center',
        className
      )}
    >
      <span className="text-xl font-black text-[#00FFCC]/60">{initials(talent.stage_name)}</span>
    </div>
  );
}

function TalentCard({
  talent,
  saved,
  onToggleSave,
}: {
  talent: ApiTalent;
  saved: boolean;
  onToggleSave: (id: string) => void;
}) {
  const genres = Array.isArray(talent.genres_vibes) ? talent.genres_vibes.slice(0, 4) : [];
  const band = rateBand(talent);
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden hover:border-[#00FFCC]/20 transition-all group">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Avatar / image */}
          <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
            <TalentAvatar talent={talent} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          </div>

          {/* Info */}
          <div className="flex-1 p-4 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight">
                  {talent.stage_name}
                  {talent.pronouns && (
                    <span className="text-white/30 font-medium text-xs ml-1.5">
                      {talent.pronouns}
                    </span>
                  )}
                </p>
                <p className="text-xs text-[#00FFCC] font-bold">
                  {talent.primary_role || 'Nightlife Talent'}
                </p>
              </div>
              <button
                onClick={() => onToggleSave(talent.id)}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center transition-colors border flex-shrink-0',
                  saved
                    ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                    : 'bg-white/5 border-white/10 text-white/30 hover:text-white'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', saved && 'fill-current')} />
              </button>
            </div>

            {/* Location + rate + S8 review aggregate */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
              {talent.neighborhood && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {talent.neighborhood}
                </span>
              )}
              {band && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  <span className="font-bold text-white/60">{band}</span>/hr
                </span>
              )}
              {talent.rating != null && (talent.rating_count ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  ★ {Number(talent.rating).toFixed(1)}
                  <span className="text-white/30">({talent.rating_count})</span>
                </span>
              )}
            </div>

            {/* Bio */}
            {talent.bio && (
              <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2">{talent.bio}</p>
            )}

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="flex items-center gap-1 text-[10px] text-white/50 bg-white/5 border border-white/8 px-2 py-0.5 rounded-lg"
                  >
                    <Music className="w-2.5 h-2.5" />
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-auto pt-1">
              <Link href="/dashboard/venue/messages">
                <Button
                  size="sm"
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7 px-3 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Contact
                </Button>
              </Link>
              {typeof talent.trust_score === 'number' ? (
                <span
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-lg border',
                    talent.trust_score >= 70
                      ? 'text-[#00FFCC]/80 bg-[#00FFCC]/5 border-[#00FFCC]/15'
                      : 'text-white/50 bg-white/5 border-white/10'
                  )}
                >
                  Trust {talent.trust_score}
                </span>
              ) : (
                typeof talent.profile_completion_pct === 'number' &&
                talent.profile_completion_pct >= 80 && (
                  <span className="text-[10px] font-bold text-[#00FFCC]/70 bg-[#00FFCC]/5 border border-[#00FFCC]/15 px-2 py-0.5 rounded-lg">
                    Complete Profile
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueBrowsePage() {
  const [search, setSearch] = useState('');
  const [rateRange, setRateRange] = useState<number[]>(RATE_RANGE_DEFAULT);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Same param strategy as gig browse (S5/#27): selections filter server-side
  // via the validated /api/talent params; multi-selects ride as CSV lists.
  const params = new URLSearchParams();
  if (rateRange[0] > RATE_RANGE_DEFAULT[0]) params.set('minRate', String(rateRange[0]));
  if (rateRange[1] < RATE_RANGE_DEFAULT[1]) params.set('maxRate', String(rateRange[1]));
  if (selectedRoles.length > 0) params.set('roles', selectedRoles.join(','));
  if (selectedNeighborhoods.length > 0)
    params.set('neighborhoods', selectedNeighborhoods.join(','));
  if (page > 1) params.set('page', String(page));
  const queryString = params.toString();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['talent-directory', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/talent${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) throw new Error('Failed to load talent');
      return res.json() as Promise<TalentListResponse>;
    },
    placeholderData: keepPreviousData,
  });

  const allTalent = useMemo(() => data?.talent ?? [], [data]);

  // Multi-selects are server-side since S5 — only the free-text quick filter
  // still refines within the fetched page.
  const filtered = allTalent.filter((t) => {
    if (!search) return true;
    const haystack =
      `${t.stage_name} ${t.primary_role ?? ''} ${(t.genres_vibes ?? []).join(' ')}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const toggleRole = (r: string) => {
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
    setPage(1);
  };
  const toggleNeighborhood = (n: string) => {
    setSelectedNeighborhoods((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
    setPage(1);
  };
  const toggleSave = (id: string) =>
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const activeFilters =
    selectedRoles.length +
    selectedNeighborhoods.length +
    (rateRange[0] !== RATE_RANGE_DEFAULT[0] || rateRange[1] !== RATE_RANGE_DEFAULT[1] ? 1 : 0);
  const savedTalent = allTalent.filter((t) => savedIds.includes(t.id));

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Browse Talent</h1>
            <p className="text-xs text-white/40">
              {isPending ? 'Loading…' : `${filtered.length} public profile${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search talent by name, role, or genre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1E1E1E] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                showFilters
                  ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                  : 'bg-[#1E1E1E] border-white/10 text-white/60 hover:text-white'
              )}
            >
              <Filter className="w-4 h-4" /> Filters
              {activeFilters > 0 && (
                <span className="bg-[#00FFCC] text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Mobile filter backdrop */}
          {showFilters && (
            <div
              className="fixed inset-0 bg-black/60 z-20 md:hidden"
              onClick={() => setShowFilters(false)}
            />
          )}

          {/* Filters sidebar — fixed overlay on mobile, inline on desktop */}
          {showFilters && (
            <aside
              className={cn(
                'border-r border-white/5 bg-[#0F0F0F] overflow-y-auto p-4 space-y-6',
                'fixed md:relative top-0 md:top-auto left-0 bottom-0 md:bottom-auto',
                'w-[280px] md:w-64 flex-shrink-0 z-30 md:z-auto',
                'pt-14 md:pt-4'
              )}
            >
              {/* Rate range */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                    Rate Range
                  </p>
                  <span className="text-xs font-bold text-white">
                    ${rateRange[0]}–${rateRange[1]}/hr
                  </span>
                </div>
                <Slider
                  min={RATE_RANGE_DEFAULT[0]}
                  max={RATE_RANGE_DEFAULT[1]}
                  step={10}
                  value={rateRange}
                  onValueChange={(range) => {
                    setRateRange(range);
                    setPage(1);
                  }}
                />
              </div>

              {/* Roles */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Role Types
                </p>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleRole(r)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors',
                        selectedRoles.includes(r)
                          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30'
                          : 'bg-[#1E1E1E] text-white/50 border-white/10 hover:text-white'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Neighborhoods */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Neighborhoods
                </p>
                <div className="space-y-1">
                  {NEIGHBORHOODS.map((n) => (
                    <button
                      key={n}
                      onClick={() => toggleNeighborhood(n)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors border',
                        selectedNeighborhoods.includes(n)
                          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/20'
                          : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent'
                      )}
                    >
                      <span className="font-medium">{n}</span>
                      {selectedNeighborhoods.includes(n) && (
                        <span className="w-4 h-4 rounded-full bg-[#00FFCC] flex items-center justify-center text-black text-[10px] font-black">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedRoles([]);
                    setSelectedNeighborhoods([]);
                    setRateRange(RATE_RANGE_DEFAULT);
                    setPage(1);
                  }}
                  className="w-full text-white/40 hover:text-red-400 text-xs"
                >
                  Clear all filters
                </Button>
              )}
            </aside>
          )}

          {/* Talent list */}
          <div className="flex-1 overflow-y-auto p-6">
            {isError ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-400/60" />
                </div>
                <p className="text-white/40 font-semibold">Couldn't load talent</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  className="mt-3 text-[#00FFCC]"
                >
                  Try again
                </Button>
              </div>
            ) : isPending ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-white/20" />
                </div>
                <p className="text-white/40 font-semibold">No talent match your filters</p>
                <p className="text-white/20 text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-white/40">
                    <span className="font-bold text-white">{filtered.length}</span> talent found
                  </p>
                </div>
                <div className="space-y-3">
                  {filtered.map((t) => (
                    <TalentCard
                      key={t.id}
                      talent={t}
                      saved={savedIds.includes(t.id)}
                      onToggleSave={toggleSave}
                    />
                  ))}
                </div>
                {(page > 1 || data?.hasMore) && (
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="text-white/60 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                    </Button>
                    <span className="text-xs text-white/40 font-bold">Page {page}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!data?.hasMore}
                      onClick={() => setPage((p) => p + 1)}
                      className="text-white/60 disabled:opacity-30"
                    >
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right panel – Saved talent */}
          <div className="hidden xl:flex flex-col w-72 flex-shrink-0 border-l border-white/5 bg-[#0F0F0F] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#00FFCC] fill-current" />
                <h3 className="text-sm font-bold">Saved Talent</h3>
              </div>
              <span className="text-xs text-white/30">{savedTalent.length}</span>
            </div>

            {savedTalent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Heart className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-xs text-white/30">No saved talent yet</p>
                <p className="text-[11px] text-white/20 mt-1">Click ♥ on any card to save</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedTalent.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border border-white/10 flex-shrink-0 bg-[#00FFCC]/20 text-[#00FFCC] overflow-hidden">
                      {t.avatar_url ? (
                        <img
                          src={t.avatar_url}
                          alt={t.stage_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        initials(t.stage_name)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{t.stage_name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-[#00FFCC]">
                          {rateBand(t) ? `${rateBand(t)}/hr` : t.primary_role ?? ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                <Link href="/dashboard/venue/messages">
                  <Button className="w-full mt-2 bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Message Saved Talent
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
