'use client';

import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Clock,
  DollarSign,
  Zap,
  SlidersHorizontal,
  Bell,
  Building2,
  Star,
  Music,
  X,
  MessageSquare,
  ChevronDown,
  Heart,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types & Data ─────────────────────────────────────────────────────────────

interface TalentListing {
  id: number;
  name: string;
  stageName?: string;
  role: string;
  genres: string[];
  neighborhood: string;
  rateMin: number;
  rateMax: number;
  rating: number;
  reviewCount: number;
  availableTonight: boolean;
  image: string;
  initials: string;
  color: string;
  tags: string[];
  bookingsThisMonth: number;
  saved: boolean;
}

const MOCK_TALENT: TalentListing[] = [
  {
    id: 1,
    name: 'Kira Voss',
    stageName: 'DJ Kira Voss',
    role: 'DJ / Producer',
    genres: ['Deep House', 'Techno'],
    neighborhood: 'Brooklyn',
    rateMin: 160,
    rateMax: 200,
    rating: 4.9,
    reviewCount: 48,
    availableTonight: true,
    image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80',
    initials: 'KV',
    color: 'bg-[#00FFCC]/20 text-[#00FFCC]',
    tags: ['Own Equipment', 'Fluent in Spanish'],
    bookingsThisMonth: 7,
    saved: false,
  },
  {
    id: 2,
    name: 'Marcus Lee',
    stageName: 'DJ Marcus',
    role: 'DJ / Producer',
    genres: ['House', 'Disco', 'Funk'],
    neighborhood: 'Midtown',
    rateMin: 100,
    rateMax: 140,
    rating: 4.7,
    reviewCount: 31,
    availableTonight: true,
    image: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&q=80',
    initials: 'ML',
    color: 'bg-purple-500/20 text-purple-400',
    tags: ['No-Equipment Gigs OK'],
    bookingsThisMonth: 5,
    saved: true,
  },
  {
    id: 3,
    name: 'Sophia Cruz',
    role: 'Mixologist',
    genres: ['Craft Cocktails', 'Bar Management'],
    neighborhood: 'Chelsea',
    rateMin: 60,
    rateMax: 80,
    rating: 4.8,
    reviewCount: 22,
    availableTonight: false,
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
    initials: 'SC',
    color: 'bg-orange-500/20 text-orange-400',
    tags: ['Signature Menu Creation', 'TIPS OK'],
    bookingsThisMonth: 9,
    saved: false,
  },
  {
    id: 4,
    name: 'James Rivera',
    role: 'Security Lead',
    genres: ['Crowd Management', 'VIP Protocols'],
    neighborhood: 'Queens',
    rateMin: 40,
    rateMax: 55,
    rating: 4.6,
    reviewCount: 17,
    availableTonight: true,
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80',
    initials: 'JR',
    color: 'bg-blue-500/20 text-blue-400',
    tags: ['Team Lead', 'License Holder'],
    bookingsThisMonth: 12,
    saved: false,
  },
  {
    id: 5,
    name: 'Yuna Kim',
    role: 'Go-Go Dancer',
    genres: ['Pop', 'Latin', 'Afrobeats'],
    neighborhood: 'Williamsburg',
    rateMin: 100,
    rateMax: 130,
    rating: 4.5,
    reviewCount: 9,
    availableTonight: true,
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400&q=80',
    initials: 'YK',
    color: 'bg-pink-500/20 text-pink-400',
    tags: ['Themed Costumes Available'],
    bookingsThisMonth: 4,
    saved: false,
  },
  {
    id: 6,
    name: 'Tony Reyes',
    stageName: 'DJ T-Rex',
    role: 'DJ / Producer',
    genres: ['Hip-Hop', 'R&B', 'Trap'],
    neighborhood: 'Harlem',
    rateMin: 100,
    rateMax: 180,
    rating: 4.7,
    reviewCount: 26,
    availableTonight: false,
    image: 'https://images.unsplash.com/photo-1598387181032-a3103a2db5b3?w=400&q=80',
    initials: 'TR',
    color: 'bg-red-500/20 text-red-400',
    tags: ['Live Remixing', 'Own Equipment'],
    bookingsThisMonth: 6,
    saved: false,
  },
  {
    id: 7,
    name: 'Amara Johnson',
    role: 'Live Vocalist',
    genres: ['R&B', 'Soul', 'Jazz'],
    neighborhood: 'Midtown',
    rateMin: 150,
    rateMax: 250,
    rating: 4.9,
    reviewCount: 34,
    availableTonight: true,
    image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400&q=80',
    initials: 'AJ',
    color: 'bg-yellow-500/20 text-yellow-400',
    tags: ['Solo or with Band', 'PA System Included'],
    bookingsThisMonth: 8,
    saved: true,
  },
  {
    id: 8,
    name: 'Carlos Mena',
    role: 'Photographer',
    genres: ['Event Photography', 'Portrait'],
    neighborhood: 'LES',
    rateMin: 110,
    rateMax: 160,
    rating: 4.8,
    reviewCount: 41,
    availableTonight: false,
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
    initials: 'CM',
    color: 'bg-green-500/20 text-green-400',
    tags: ['Same-Day Delivery', 'Drone Available'],
    bookingsThisMonth: 11,
    saved: false,
  },
];

const ROLES = [
  'DJ / Producer',
  'Mixologist',
  'Security Lead',
  'Go-Go Dancer',
  'Live Vocalist',
  'Photographer',
  'Bartender',
  'Host / MC',
];
const NEIGHBORHOODS = ['Brooklyn', 'Midtown', 'Chelsea', 'Queens', 'Williamsburg', 'Harlem', 'LES'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function TalentCard({
  talent,
  onSave,
  onContact,
}: {
  talent: TalentListing;
  onSave: (id: number) => void;
  onContact: (id: number) => void;
}) {
  return (
    <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden hover:border-[#00FFCC]/20 transition-all group">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Avatar / image */}
          <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
            <img src={talent.image} alt={talent.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            {talent.availableTonight && (
              <span className="absolute bottom-2 left-2 text-[9px] font-black bg-[#00FFCC] text-black px-1.5 py-0.5 rounded">
                TONIGHT
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-4 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-white group-hover:text-[#00FFCC] transition-colors leading-tight">
                  {talent.stageName ?? talent.name}
                </p>
                <p className="text-xs text-[#00FFCC] font-bold">{talent.role}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onSave(talent.id)}
                  className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center transition-colors border',
                    talent.saved
                      ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                      : 'bg-white/5 border-white/10 text-white/30 hover:text-white'
                  )}
                >
                  <Heart className={cn('w-3.5 h-3.5', talent.saved && 'fill-current')} />
                </button>
              </div>
            </div>

            {/* Rating + location */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className="text-white/70 font-bold">{talent.rating}</span>
                <span className="text-white/30">({talent.reviewCount})</span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {talent.neighborhood}
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                <span className="font-bold text-white/60">
                  ${talent.rateMin}–${talent.rateMax}
                </span>
                /hr
              </span>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5">
              {talent.genres.map((g) => (
                <span
                  key={g}
                  className="flex items-center gap-1 text-[10px] text-white/50 bg-white/5 border border-white/8 px-2 py-0.5 rounded-lg"
                >
                  <Music className="w-2.5 h-2.5" />
                  {g}
                </span>
              ))}
            </div>

            {/* Tags */}
            {talent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {talent.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-bold text-[#00FFCC]/70 bg-[#00FFCC]/5 border border-[#00FFCC]/15 px-2 py-0.5 rounded-lg"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-auto pt-1">
              <Button
                size="sm"
                onClick={() => onContact(talent.id)}
                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7 px-3 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Contact
              </Button>
              <span className="text-[11px] text-white/25">
                {talent.bookingsThisMonth} bookings this month
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueBrowsePage() {
  const [talent, setTalent] = useState(MOCK_TALENT);
  const [search, setSearch] = useState('');
  const [tonightOnly, setTonightOnly] = useState(false);
  const [rateRange, setRateRange] = useState([40, 260]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [contacted, setContacted] = useState<number[]>([]);

  const toggleRole = (r: string) =>
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  const toggleNeighborhood = (n: string) =>
    setSelectedNeighborhoods((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  const toggleSave = (id: number) =>
    setTalent((prev) => prev.map((t) => (t.id === id ? { ...t, saved: !t.saved } : t)));
  const handleContact = (id: number) => {
    setContacted((prev) => [...prev, id]);
  };

  const filtered = talent.filter((t) => {
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !(t.stageName ?? '').toLowerCase().includes(search.toLowerCase()) &&
      !t.role.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (tonightOnly && !t.availableTonight) return false;
    if (t.rateMin > rateRange[1] || t.rateMax < rateRange[0]) return false;
    if (
      selectedRoles.length &&
      !selectedRoles.some((r) => t.role.toLowerCase().includes(r.toLowerCase()))
    )
      return false;
    if (selectedNeighborhoods.length && !selectedNeighborhoods.includes(t.neighborhood))
      return false;
    return true;
  });

  const activeFilters =
    selectedRoles.length +
    selectedNeighborhoods.length +
    (tonightOnly ? 1 : 0) +
    (rateRange[0] !== 40 || rateRange[1] !== 260 ? 1 : 0);
  const savedTalent = talent.filter((t) => t.saved);

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Browse Talent</h1>
            <p className="text-xs text-white/40">{filtered.length} available in your area</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
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
                placeholder="Search talent by name, role, or specialty…"
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
              {/* Available tonight */}
              <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-[#1E1E1E] border border-white/5">
                <div>
                  <p className="text-sm font-bold text-white">Available Tonight</p>
                  <p className="text-[11px] text-white/40">Show only tonight</p>
                </div>
                <Switch
                  checked={tonightOnly}
                  onCheckedChange={setTonightOnly}
                  className="data-[state=checked]:bg-[#00FFCC]"
                />
              </div>

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
                  min={20}
                  max={400}
                  step={10}
                  value={rateRange}
                  onValueChange={setRateRange}
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
                    setTonightOnly(false);
                    setRateRange([40, 260]);
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-white/40">
                <span className="font-bold text-white">{filtered.length}</span> talent found
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
                <p className="text-white/40 font-semibold">No talent match your filters</p>
                <p className="text-white/20 text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => (
                  <TalentCard
                    key={t.id}
                    talent={{ ...t, saved: contacted.includes(t.id) ? t.saved : t.saved }}
                    onSave={toggleSave}
                    onContact={handleContact}
                  />
                ))}
              </div>
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
                    <div
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border border-white/10 flex-shrink-0',
                        t.color
                      )}
                    >
                      {t.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {t.stageName ?? t.name}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-[#00FFCC]">
                          ${t.rateMin}–${t.rateMax}/hr
                        </p>
                        {t.availableTonight && (
                          <span className="text-[9px] font-black bg-[#00FFCC]/10 text-[#00FFCC] px-1.5 py-0.5 rounded">
                            AVAIL.
                          </span>
                        )}
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

            {/* Zap insight */}
            <div className="mt-6 p-3 rounded-xl bg-[#1A1A1A] border border-[#00FFCC]/10">
              <div className="flex items-start gap-2">
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-white/40 leading-relaxed">
                  <span className="text-white/60 font-bold">3 DJ / Producers</span> posted new
                  availability in your area today.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
