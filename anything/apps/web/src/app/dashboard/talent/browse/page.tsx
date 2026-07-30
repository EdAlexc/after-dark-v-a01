'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search,
  MapPin,
  Clock,
  DollarSign,
  Zap,
  SlidersHorizontal,
  LayoutGrid,
  Map,
  ChevronLeft,
  ChevronRight,
  Bell,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';
import {
  type ApiGig,
  type GigListResponse,
  formatRate,
  formatTimeRange,
  formatDate,
  gigRate,
  gigUrgency,
} from '@/lib/gigs';

const NEIGHBORHOODS = ['Chelsea', 'Midtown', 'Meatpacking', 'Flatiron', 'LES', 'Williamsburg'];
const ROLES = ['DJ', 'Go-Go Dancer', 'Bartender', 'Bottle Server', 'Photographer', 'Security'];
const PAY_RANGE_DEFAULT: number[] = [20, 400];

const URGENCY_CONFIG = {
  HOT: { label: 'HOT', color: 'bg-red-500 text-white' },
  NEW: { label: 'NEW', color: 'bg-[#00FFCC] text-black' },
};

// ─── Data ────────────────────────────────────────────────────────────────────

interface BrowseFilters {
  tonightOnly: boolean;
  payRange: number[];
  neighborhoods: string[];
  roles: string[];
  page: number;
}

/**
 * Server-side filtering via the validated /api/gigs query params. The API
 * takes a single neighborhood/role, so multi-selects send the sole selection
 * when there is exactly one and refine client-side otherwise.
 */
function gigsQueryString(filters: BrowseFilters): string {
  const params = new URLSearchParams();
  if (filters.tonightOnly) params.set('tonightOnly', 'true');
  if (filters.payRange[0] > PAY_RANGE_DEFAULT[0]) params.set('minRate', String(filters.payRange[0]));
  if (filters.payRange[1] < PAY_RANGE_DEFAULT[1]) params.set('maxRate', String(filters.payRange[1]));
  if (filters.neighborhoods.length === 1) params.set('neighborhood', filters.neighborhoods[0]);
  if (filters.roles.length === 1) params.set('role', filters.roles[0]);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
}

function matchesClientFilters(gig: ApiGig, filters: BrowseFilters, search: string): boolean {
  const haystack =
    `${gig.title} ${gig.venue_name ?? ''} ${gig.role_needed ?? ''} ${gig.venue_neighborhood ?? ''}`.toLowerCase();
  if (search && !haystack.includes(search.toLowerCase())) return false;
  if (filters.neighborhoods.length > 1) {
    const hood = (gig.venue_neighborhood ?? gig.address ?? '').toLowerCase();
    if (!filters.neighborhoods.some((n) => hood.includes(n.toLowerCase()))) return false;
  }
  if (filters.roles.length > 1) {
    const role = (gig.role_needed ?? '').toLowerCase();
    if (!filters.roles.some((r) => role.includes(r.toLowerCase()))) return false;
  }
  return true;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GigImage({ gig, className }: { gig: ApiGig; className?: string }) {
  if (gig.venue_avatar_url) {
    return (
      <img
        src={gig.venue_avatar_url}
        alt={gig.venue_name ?? gig.title}
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
      <span className="text-2xl font-black text-[#00FFCC]/60">
        {(gig.venue_name ?? gig.title).charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function GigCard({ gig }: { gig: ApiGig }) {
  const urgency = gigUrgency(gig);
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden hover:border-[#00FFCC]/20 transition-all group">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Image */}
          <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
            <GigImage gig={gig} />
            {urgency && (
              <span
                className={cn(
                  'absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded',
                  URGENCY_CONFIG[urgency].color
                )}
              >
                {URGENCY_CONFIG[urgency].label}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-sm font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight">
                    {gig.title}
                  </p>
                  <p className="text-xs text-[#00FFCC] font-bold">
                    {gig.role_needed || 'Nightlife Talent'}
                    {gig.venue_name ? ` · ${gig.venue_name}` : ''}
                  </p>
                </div>
                <span className="text-lg font-black text-white flex-shrink-0">
                  {gigRate(gig) !== null ? `$${Number(gigRate(gig)).toFixed(0)}` : '—'}
                  <span className="text-xs font-normal text-white/40">/hr</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40 mt-2">
                {formatTimeRange(gig.start_time, gig.end_time) && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(gig.start_time)} · {formatTimeRange(gig.start_time, gig.end_time)}
                  </span>
                )}
                {gig.venue_neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {gig.venue_neighborhood}
                  </span>
                )}
                {gig.tips_included && (
                  <span className="flex items-center gap-1 text-green-400">
                    <DollarSign className="w-3 h-3" />
                    Tips included
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end mt-3">
              <Link href={`/gigs/${gig.id}`}>
                <Button
                  size="sm"
                  className="font-bold text-xs bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 transition-all"
                >
                  View & Apply
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrowseGigsPage() {
  const [search, setSearch] = useState('');
  const [tonightOnly, setTonightOnly] = useState(false);
  const [payRange, setPayRange] = useState<number[]>(PAY_RANGE_DEFAULT);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const filters: BrowseFilters = {
    tonightOnly,
    payRange,
    neighborhoods: selectedNeighborhoods,
    roles: selectedRoles,
    page,
  };
  const queryString = gigsQueryString(filters);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['gigs', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/gigs${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<GigListResponse>;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const gigs = useMemo(() => data?.gigs ?? [], [data]);
  const filtered = useMemo(
    () => gigs.filter((gig) => matchesClientFilters(gig, filters, search)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gigs, search, selectedNeighborhoods, selectedRoles]
  );
  const hotGigs = filtered.filter((gig) => gigUrgency(gig) === 'HOT').slice(0, 4);

  const resetToFirstPage = () => setPage(1);

  const toggleNeighborhood = (n: string) => {
    setSelectedNeighborhoods((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
    resetToFirstPage();
  };

  const toggleRole = (r: string) => {
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
    resetToFirstPage();
  };

  const activeFilterCount =
    selectedNeighborhoods.length +
    selectedRoles.length +
    (tonightOnly ? 1 : 0) +
    (payRange[0] !== PAY_RANGE_DEFAULT[0] || payRange[1] !== PAY_RANGE_DEFAULT[1] ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Browse Gigs</h1>
            <p className="text-xs text-white/40">
              {isPending ? 'Loading…' : `${filtered.length} open gig${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </header>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search gigs, venues, roles…"
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
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-[#00FFCC] text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {/* List / Map toggle */}
            <div className="flex items-center bg-[#1E1E1E] border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors',
                  viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:block">List</span>
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold transition-colors',
                  viewMode === 'map' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                )}
              >
                <Map className="w-4 h-4" />
                <span className="hidden sm:block">Map</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
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
              {/* Available Tonight */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                    Availability
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 py-2.5 px-3 rounded-xl bg-[#1E1E1E] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Available Tonight</p>
                    <p className="text-[11px] text-white/40">Show only tonight's gigs</p>
                  </div>
                  <Switch
                    checked={tonightOnly}
                    onCheckedChange={(checked) => {
                      setTonightOnly(checked);
                      resetToFirstPage();
                    }}
                    className="data-[state=checked]:bg-[#00FFCC]"
                  />
                </div>
              </div>

              {/* Neighborhoods */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Neighborhoods
                </p>
                <div className="space-y-1.5">
                  {NEIGHBORHOODS.map((n) => (
                    <button
                      key={n}
                      onClick={() => toggleNeighborhood(n)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedNeighborhoods.includes(n)
                          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/20'
                          : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
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

              {/* Pay Range */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                    Pay Range
                  </p>
                  <span className="text-xs font-bold text-white">
                    ${payRange[0]} – ${payRange[1]}/hr
                  </span>
                </div>
                <Slider
                  min={PAY_RANGE_DEFAULT[0]}
                  max={PAY_RANGE_DEFAULT[1]}
                  step={10}
                  value={payRange}
                  onValueChange={(range) => {
                    setPayRange(range);
                    resetToFirstPage();
                  }}
                  className="[&_.slider-thumb]:bg-[#00FFCC] [&_.slider-range]:bg-[#00FFCC]"
                />
              </div>

              {/* Role Types */}
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

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedNeighborhoods([]);
                    setSelectedRoles([]);
                    setTonightOnly(false);
                    setPayRange(PAY_RANGE_DEFAULT);
                    resetToFirstPage();
                  }}
                  className="w-full text-white/40 hover:text-red-400 text-xs"
                >
                  Clear all filters
                </Button>
              )}
            </aside>
          )}

          {/* Gig list */}
          <div className="flex-1 overflow-y-auto p-6">
            {viewMode === 'list' ? (
              <>
                {isError ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-red-400/60" />
                    </div>
                    <p className="text-white/40 font-semibold">Couldn't load gigs</p>
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
                    <p className="text-white/40 font-semibold">No gigs match your filters</p>
                    <p className="text-white/20 text-sm mt-1">
                      Try adjusting your search or filters
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-white/40">
                        <span className="font-bold text-white">{filtered.length}</span> gigs found
                      </p>
                    </div>
                    <div className="space-y-3">
                      {filtered.map((gig) => (
                        <GigCard key={gig.id} gig={gig} />
                      ))}
                    </div>
                    {/* Pagination */}
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
              </>
            ) : (
              /* Map view placeholder (post-alpha, Technical Backlog #1) */
              <div className="h-full min-h-[500px] rounded-2xl bg-[#1A1A1A] border border-white/5 flex flex-col items-center justify-center gap-4">
                <Map className="w-12 h-12 text-white/10" />
                <div className="text-center">
                  <p className="text-white/40 font-semibold">Map View</p>
                  <p className="text-white/20 text-sm mt-1">Coming soon — use List for now</p>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 px-8">
                  {filtered.slice(0, 4).map((gig) => (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.id}`}
                      className="flex items-center gap-2 bg-[#1E1E1E] border border-white/10 px-3 py-2 rounded-xl hover:border-[#00FFCC]/30 transition-colors"
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          gigUrgency(gig) === 'HOT' ? 'bg-red-400' : 'bg-[#00FFCC]'
                        )}
                      />
                      <span className="text-xs font-bold text-white">
                        {gig.venue_name ?? gig.title}
                      </span>
                      <span className="text-xs text-white/40">{formatRate(gig)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Hot Gigs panel */}
          <div className="hidden xl:flex flex-col w-72 flex-shrink-0 border-l border-white/5 bg-[#0F0F0F] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">Hot Gigs Tonight</h3>
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current" />
              </div>
              {hotGigs.length > 0 && (
                <span className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                  Live
                </span>
              )}
            </div>

            {hotGigs.length === 0 ? (
              <p className="text-xs text-white/30 leading-relaxed">
                Nothing starting in the next 24 hours yet. Check back after venues post tonight's
                lineups.
              </p>
            ) : (
              <div className="space-y-3">
                {hotGigs.map((gig) => (
                  <Link key={gig.id} href={`/gigs/${gig.id}`} className="block">
                    <Card className="bg-[#1A1A1A] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                            <GigImage gig={gig} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-xs font-bold leading-tight group-hover:text-[#00FFCC] transition-colors truncate">
                                {gig.venue_name ?? gig.title}
                              </p>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0 bg-red-500 text-white">
                                HOT
                              </span>
                            </div>
                            <p className="text-[11px] text-[#00FFCC] font-bold">
                              {gig.role_needed || 'Nightlife Talent'}
                            </p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-[11px] text-white/40 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {formatTimeRange(gig.start_time, null)}
                              </span>
                              <span className="text-xs font-black text-white">
                                {formatRate(gig)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
