'use client';

import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Clock,
  DollarSign,
  Zap,
  SlidersHorizontal,
  LayoutGrid,
  Map,
  ChevronDown,
  Bell,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Gig {
  id: number;
  venueName: string;
  neighborhood: string;
  role: string;
  genre?: string;
  time: string;
  endTime: string;
  rate: number;
  tipsIncluded: boolean;
  distance: string;
  urgency?: 'HOT' | 'URGENT' | 'NEW';
  image: string;
  applied?: boolean;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_GIGS: Gig[] = [
  {
    id: 1,
    venueName: 'Nebula NYC',
    neighborhood: 'Midtown',
    role: 'DJ / Producer',
    genre: 'House / Techno',
    time: '10:00 PM',
    endTime: '3:00 AM',
    rate: 180,
    tipsIncluded: false,
    distance: '0.4 mi',
    urgency: 'HOT',
    image: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&q=80',
  },
  {
    id: 2,
    venueName: 'PHD Rooftop',
    neighborhood: 'Downtown',
    role: 'DJ',
    genre: 'Hip-Hop / R&B',
    time: '11:00 PM',
    endTime: '4:00 AM',
    rate: 220,
    tipsIncluded: false,
    distance: '1.1 mi',
    urgency: 'URGENT',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
  },
  {
    id: 3,
    venueName: 'Limelight',
    neighborhood: 'Chelsea',
    role: 'Go-Go Dancer',
    genre: 'Afrobeats',
    time: '9:00 PM',
    endTime: '2:00 AM',
    rate: 140,
    tipsIncluded: true,
    distance: '0.8 mi',
    urgency: 'NEW',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400&q=80',
  },
  {
    id: 4,
    venueName: 'Butter Group',
    neighborhood: 'Meatpacking',
    role: 'Bottle Server',
    time: '8:00 PM',
    endTime: '2:00 AM',
    rate: 100,
    tipsIncluded: true,
    distance: '1.4 mi',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
  },
  {
    id: 5,
    venueName: '230 Fifth',
    neighborhood: 'Flatiron',
    role: 'Bartender',
    genre: 'Mixed',
    time: '6:00 PM',
    endTime: '11:00 PM',
    rate: 75,
    tipsIncluded: true,
    distance: '2.0 mi',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
  },
  {
    id: 6,
    venueName: 'Output BK',
    neighborhood: 'Williamsburg',
    role: 'DJ / Producer',
    genre: 'Techno',
    time: '11:00 PM',
    endTime: '6:00 AM',
    rate: 200,
    tipsIncluded: false,
    distance: '4.3 mi',
    urgency: 'HOT',
    image: 'https://images.unsplash.com/photo-1598387181032-a3103a2db5b3?w=400&q=80',
  },
  {
    id: 7,
    venueName: 'The Box',
    neighborhood: 'LES',
    role: 'Photographer',
    time: '9:00 PM',
    endTime: '3:00 AM',
    rate: 120,
    tipsIncluded: false,
    distance: '1.7 mi',
    urgency: 'NEW',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80',
  },
  {
    id: 8,
    venueName: 'The Standard',
    neighborhood: 'Meatpacking',
    role: 'Go-Go Dancer',
    genre: 'Latin',
    time: '10:00 PM',
    endTime: '4:00 AM',
    rate: 160,
    tipsIncluded: true,
    distance: '1.2 mi',
    image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400&q=80',
  },
];

const NEIGHBORHOODS = ['Chelsea', 'Midtown', 'Meatpacking', 'Flatiron', 'LES', 'Williamsburg'];
const ROLES = ['DJ', 'Go-Go Dancer', 'Bartender', 'Bottle Server', 'Photographer', 'Bouncer'];
const GENRES = ['House', 'Hip-Hop', 'Techno', 'R&B', 'Afrobeats', 'Pop', 'Latin'];

const URGENCY_CONFIG = {
  HOT: { label: 'HOT', color: 'bg-red-500 text-white' },
  URGENT: { label: 'URGENT', color: 'bg-orange-500 text-white' },
  NEW: { label: 'NEW', color: 'bg-[#00FFCC] text-black' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function GigCard({ gig, onApply }: { gig: Gig; onApply: (id: number) => void }) {
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden hover:border-[#00FFCC]/20 transition-all group">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Image */}
          <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
            <img src={gig.image} alt={gig.venueName} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40" />
            {gig.urgency && (
              <span
                className={cn(
                  'absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded',
                  URGENCY_CONFIG[gig.urgency].color
                )}
              >
                {gig.urgency}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-sm font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight">
                    {gig.venueName}
                  </p>
                  <p className="text-xs text-[#00FFCC] font-bold">{gig.role}</p>
                </div>
                <span className="text-lg font-black text-white flex-shrink-0">
                  ${gig.rate}
                  <span className="text-xs font-normal text-white/40">/hr</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40 mt-2">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {gig.time} – {gig.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {gig.neighborhood} · {gig.distance}
                </span>
                {gig.tipsIncluded && (
                  <span className="flex items-center gap-1 text-green-400">
                    <DollarSign className="w-3 h-3" />
                    Tips included
                  </span>
                )}
              </div>
              {gig.genre && <p className="text-[11px] text-white/30 mt-1">{gig.genre}</p>}
            </div>

            <div className="flex items-center justify-end mt-3">
              <Button
                size="sm"
                onClick={() => onApply(gig.id)}
                className={cn(
                  'font-bold text-xs transition-all',
                  gig.applied
                    ? 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/30 hover:bg-[#00FFCC]/20'
                    : 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                )}
              >
                {gig.applied ? '✓ Applied' : 'Apply Now'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrowseGigsPage() {
  const [gigs, setGigs] = useState<Gig[]>(MOCK_GIGS);
  const [search, setSearch] = useState('');
  const [tonightOnly, setTonightOnly] = useState(false);
  const [payRange, setPayRange] = useState<number[]>([50, 250]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);

  const toggleNeighborhood = (n: string) =>
    setSelectedNeighborhoods((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );

  const toggleRole = (r: string) =>
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const toggleGenre = (g: string) =>
    setSelectedGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const handleApply = (id: number) => {
    setGigs((prev) => prev.map((g) => (g.id === id ? { ...g, applied: !g.applied } : g)));
  };

  const filtered = gigs.filter((g) => {
    if (
      search &&
      !g.venueName.toLowerCase().includes(search.toLowerCase()) &&
      !g.role.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (g.rate < payRange[0] || g.rate > payRange[1]) return false;
    if (selectedNeighborhoods.length && !selectedNeighborhoods.includes(g.neighborhood))
      return false;
    if (
      selectedRoles.length &&
      !selectedRoles.some((r) => g.role.toLowerCase().includes(r.toLowerCase()))
    )
      return false;
    return true;
  });

  const hotGigs = MOCK_GIGS.filter((g) => g.urgency);
  const activeFilterCount =
    selectedNeighborhoods.length +
    selectedRoles.length +
    selectedGenres.length +
    (tonightOnly ? 1 : 0) +
    (payRange[0] !== 50 || payRange[1] !== 250 ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Browse Gigs</h1>
            <p className="text-xs text-white/40">{filtered.length} available tonight</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
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
                placeholder="Search venues, roles, neighborhoods…"
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
                    onCheckedChange={setTonightOnly}
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
                  min={20}
                  max={400}
                  step={10}
                  value={payRange}
                  onValueChange={setPayRange}
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

              {/* Genres */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Genres
                </p>
                <div className="flex flex-wrap gap-2">
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors',
                        selectedGenres.includes(g)
                          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/30'
                          : 'bg-[#1E1E1E] text-white/50 border-white/10 hover:text-white'
                      )}
                    >
                      {g}
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
                    setSelectedGenres([]);
                    setTonightOnly(false);
                    setPayRange([50, 250]);
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
                {/* Sort bar */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-white/40">
                    <span className="font-bold text-white">{filtered.length}</span> gigs found
                  </p>
                  <button className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
                    Sort: Best Match <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {filtered.length === 0 ? (
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
                  <div className="space-y-3">
                    {filtered.map((gig) => (
                      <GigCard key={gig.id} gig={gig} onApply={handleApply} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Map view placeholder */
              <div className="h-full min-h-[500px] rounded-2xl bg-[#1A1A1A] border border-white/5 flex flex-col items-center justify-center gap-4">
                <Map className="w-12 h-12 text-white/10" />
                <div className="text-center">
                  <p className="text-white/40 font-semibold">Map View</p>
                  <p className="text-white/20 text-sm mt-1">
                    Connect Google Maps to enable this view
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 px-8">
                  {filtered.slice(0, 4).map((gig) => (
                    <div
                      key={gig.id}
                      className="flex items-center gap-2 bg-[#1E1E1E] border border-white/10 px-3 py-2 rounded-xl"
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          gig.urgency ? 'bg-red-400' : 'bg-[#00FFCC]'
                        )}
                      />
                      <span className="text-xs font-bold text-white">{gig.venueName}</span>
                      <span className="text-xs text-white/40">${gig.rate}/hr</span>
                    </div>
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
              <span className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Live
              </span>
            </div>

            <div className="space-y-3">
              {hotGigs.map((gig) => (
                <Card
                  key={gig.id}
                  className="bg-[#1A1A1A] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group"
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={gig.image}
                          alt={gig.venueName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-bold leading-tight group-hover:text-[#00FFCC] transition-colors truncate">
                            {gig.venueName}
                          </p>
                          {gig.urgency && (
                            <span
                              className={cn(
                                'text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0',
                                URGENCY_CONFIG[gig.urgency].color
                              )}
                            >
                              {gig.urgency}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#00FFCC] font-bold">{gig.role}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] text-white/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {gig.time}
                          </span>
                          <span className="text-xs font-black text-white">${gig.rate}/hr</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleApply(gig.id)}
                      className={cn(
                        'w-full mt-2.5 font-bold text-xs h-7',
                        gig.applied
                          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/30'
                          : 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                      )}
                    >
                      {gig.applied ? '✓ Applied' : 'Quick Apply'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Neighborhood map placeholder */}
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                Nearby Venues
              </p>
              <div className="aspect-square rounded-xl bg-[#1A1A1A] border border-white/5 flex items-center justify-center">
                <div className="text-center">
                  <Map className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-[11px] text-white/20">Map preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
