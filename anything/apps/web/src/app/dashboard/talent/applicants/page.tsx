'use client';

import React, { useState } from 'react';
import {
  Bell,
  Search,
  Building2,
  MapPin,
  Clock,
  DollarSign,
  Star,
  ChevronRight,
  Zap,
  CheckCircle2,
  XCircle,
  MessageSquare,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types & Data ─────────────────────────────────────────────────────────────

type AppStatus = 'PENDING' | 'INTERESTED' | 'ACCEPTED' | 'DECLINED';

interface VenueApplication {
  id: number;
  venueName: string;
  venueNeighborhood: string;
  venueRating: number;
  gigTitle: string;
  role: string;
  date: string;
  time: string;
  offeredRate: number | null;
  yourRate: number;
  status: AppStatus;
  receivedAt: string;
  unread: boolean;
  image: string;
}

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; dot: string }> = {
  PENDING: {
    label: 'Pending',
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    dot: 'bg-yellow-400',
  },
  INTERESTED: {
    label: 'Interested',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
    dot: 'bg-[#00FFCC]',
  },
  ACCEPTED: {
    label: 'Accepted',
    color: 'text-green-400 bg-green-400/10 border-green-400/20',
    dot: 'bg-green-400',
  },
  DECLINED: {
    label: 'Declined',
    color: 'text-red-400 bg-red-400/10 border-red-400/20',
    dot: 'bg-red-400',
  },
};

const MOCK_APPLICATIONS: VenueApplication[] = [
  {
    id: 1,
    venueName: 'Nebula NYC',
    venueNeighborhood: 'Midtown',
    venueRating: 4.8,
    gigTitle: 'Closing Set – Main Room',
    role: 'DJ / Producer',
    date: 'Sat Jul 19',
    time: '2AM–6AM',
    offeredRate: 180,
    yourRate: 160,
    status: 'INTERESTED',
    receivedAt: '2h ago',
    unread: true,
    image: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&q=80',
  },
  {
    id: 2,
    venueName: 'PHD Rooftop',
    venueNeighborhood: 'Downtown',
    venueRating: 4.7,
    gigTitle: 'Friday Night Main Set',
    role: 'DJ / Producer',
    date: 'Fri Jul 18',
    time: '11PM–4AM',
    offeredRate: 220,
    yourRate: 160,
    status: 'ACCEPTED',
    receivedAt: '5h ago',
    unread: false,
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
  },
  {
    id: 3,
    venueName: 'Output BK',
    venueNeighborhood: 'Williamsburg',
    venueRating: 4.9,
    gigTitle: 'Saturday Techno Night',
    role: 'DJ / Producer',
    date: 'Sat Jul 25',
    time: '2AM–6AM',
    offeredRate: null,
    yourRate: 160,
    status: 'PENDING',
    receivedAt: '1d ago',
    unread: false,
    image: 'https://images.unsplash.com/photo-1598387181032-a3103a2db5b3?w=400&q=80',
  },
  {
    id: 4,
    venueName: 'The Standard',
    venueNeighborhood: 'Meatpacking',
    venueRating: 4.6,
    gigTitle: 'Rooftop Pool Party',
    role: 'DJ',
    date: 'Sun Jul 20',
    time: '2PM–8PM',
    offeredRate: 150,
    yourRate: 160,
    status: 'DECLINED',
    receivedAt: '2d ago',
    unread: false,
    image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400&q=80',
  },
  {
    id: 5,
    venueName: 'Limelight',
    venueNeighborhood: 'Chelsea',
    venueRating: 4.5,
    gigTitle: 'Afrobeats Friday Warm-up',
    role: 'DJ',
    date: 'Fri Jul 25',
    time: '8PM–11PM',
    offeredRate: 120,
    yourRate: 160,
    status: 'PENDING',
    receivedAt: '3d ago',
    unread: false,
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400&q=80',
  },
];

const SUMMARY = [
  { label: 'Total Received', value: '12', icon: <Bell className="w-4 h-4" />, color: 'text-white' },
  { label: 'Interested', value: '4', icon: <Zap className="w-4 h-4" />, color: 'text-[#00FFCC]' },
  {
    label: 'Accepted',
    value: '3',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-400',
  },
  {
    label: 'Pending Reply',
    value: '5',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-yellow-400',
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TalentApplicantsPage() {
  const [apps, setApps] = useState(MOCK_APPLICATIONS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AppStatus | 'ALL'>('ALL');

  const filtered = apps.filter((a) => {
    if (filter !== 'ALL' && a.status !== filter) return false;
    if (
      search &&
      !a.venueName.toLowerCase().includes(search.toLowerCase()) &&
      !a.gigTitle.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const updateStatus = (id: number, status: AppStatus) => {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status, unread: false } : a)));
  };

  const FILTER_TABS: { label: string; value: AppStatus | 'ALL' }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Interested', value: 'INTERESTED' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Declined', value: 'DECLINED' },
  ];

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Applicants</h1>
            <p className="text-xs text-white/40">Venues requesting your services</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Summary row */}
          <div className="px-6 py-4 border-b border-white/5 bg-[#0F0F0F]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SUMMARY.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#1A1A1A] border border-white/5"
                >
                  <div className={cn('flex-shrink-0', s.color)}>{s.icon}</div>
                  <div>
                    <p className={cn('text-lg font-black leading-none', s.color)}>{s.value}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Search + filters */}
          <div className="px-6 py-3 border-b border-white/5 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Search venues or gig titles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1E1E1E] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#00FFCC]/40 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors border',
                    filter === tab.value
                      ? 'bg-[#00FFCC]/10 border-[#00FFCC]/30 text-[#00FFCC]'
                      : 'bg-[#1E1E1E] border-white/10 text-white/50 hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              ))}
              <button className="w-8 h-8 rounded-lg bg-[#1E1E1E] border border-white/10 flex items-center justify-center text-white/40 hover:text-white flex-shrink-0">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Applications list */}
          <div className="p-6 space-y-3">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <Building2 className="w-7 h-7 text-white/15" />
                </div>
                <p className="text-white/40 font-bold">No applications found</p>
                <p className="text-white/20 text-sm mt-1">Try a different filter or search term</p>
              </div>
            )}

            {filtered.map((app) => {
              const st = STATUS_CONFIG[app.status];
              const rateMatch = app.offeredRate !== null && app.offeredRate >= app.yourRate;
              return (
                <Card
                  key={app.id}
                  className={cn(
                    'bg-[#1E1E1E] border overflow-hidden transition-all',
                    app.unread ? 'border-[#00FFCC]/20' : 'border-white/5 hover:border-white/10'
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      {/* Venue image */}
                      <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
                        <img
                          src={app.image}
                          alt={app.venueName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40" />
                        {app.unread && (
                          <div className="absolute top-2 left-2 w-2 h-2 bg-[#00FFCC] rounded-full" />
                        )}
                      </div>

                      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-black text-white">{app.venueName}</p>
                              <div className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-[11px] text-white/50">{app.venueRating}</span>
                              </div>
                            </div>
                            <p className="text-xs text-[#00FFCC] font-bold">{app.gigTitle}</p>
                          </div>
                          <span
                            className={cn(
                              'text-[11px] font-black px-2.5 py-1 rounded-full border flex-shrink-0',
                              st.color
                            )}
                          >
                            {st.label}
                          </span>
                        </div>

                        {/* Meta */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {app.venueNeighborhood}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {app.date} · {app.time}
                          </span>
                          {app.offeredRate !== null ? (
                            <span
                              className={cn(
                                'flex items-center gap-1 font-bold',
                                rateMatch ? 'text-green-400' : 'text-yellow-400'
                              )}
                            >
                              <DollarSign className="w-3 h-3" />
                              Offering ${app.offeredRate}/hr
                              {rateMatch ? ' ✓' : ` (your rate: $${app.yourRate})`}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-white/30 italic">
                              <DollarSign className="w-3 h-3" /> Rate pending
                            </span>
                          )}
                          {app.status === 'PENDING' && (
                            <span className="flex items-center gap-1 text-white/25">
                              <TrendingUp className="w-3 h-3" /> Received {app.receivedAt}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        {app.status === 'PENDING' || app.status === 'INTERESTED' ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, 'ACCEPTED')}
                              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7 px-3 flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, 'INTERESTED')}
                              className={cn(
                                'font-bold text-xs h-7 px-3 flex items-center gap-1 transition-colors',
                                app.status === 'INTERESTED'
                                  ? 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/30'
                                  : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                              )}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {app.status === 'INTERESTED' ? 'Interested' : 'Mark Interested'}
                            </Button>
                            <Link href="/dashboard/talent/messages">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-white/40 hover:text-white text-xs h-7 px-2 flex items-center gap-1"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> Message
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, 'DECLINED')}
                              className="bg-transparent text-red-400/60 hover:text-red-400 hover:bg-red-400/5 text-xs h-7 px-2 flex items-center gap-1 border border-transparent hover:border-red-400/20 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Decline
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {app.status === 'ACCEPTED' && (
                              <Link href="/dashboard/talent/messages">
                                <Button
                                  size="sm"
                                  className="bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 font-bold text-xs h-7 px-3 flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" /> Message Venue
                                </Button>
                              </Link>
                            )}
                            {app.status === 'DECLINED' && (
                              <Button
                                size="sm"
                                onClick={() => updateStatus(app.id, 'PENDING')}
                                className="bg-white/5 text-white/40 border border-white/10 hover:text-white text-xs h-7 px-3"
                              >
                                Undo
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-white/30 hover:text-white text-xs h-7 px-2 flex items-center gap-1"
                            >
                              View Details <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
