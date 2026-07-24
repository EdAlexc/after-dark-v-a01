'use client';

import React, { useState } from 'react';
import {
  Bell,
  Search,
  Star,
  MapPin,
  DollarSign,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  MessageSquare,
  SlidersHorizontal,
  ChevronRight,
  Building2,
  Users,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types & Data ─────────────────────────────────────────────────────────────

type AppStatus = 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED';

interface TalentApplication {
  id: number;
  name: string;
  stageName?: string;
  role: string;
  neighborhood: string;
  rating: number;
  reviewCount: number;
  proposedRate: number;
  yourRate: number;
  gigTitle: string;
  gigDate: string;
  gigTime: string;
  status: AppStatus;
  appliedAt: string;
  unread: boolean;
  coverMessage: string;
  initials: string;
  color: string;
  image: string;
}

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
  },
  HIRED: { label: 'Hired', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  REJECTED: { label: 'Rejected', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

const MOCK_APPLICATIONS: TalentApplication[] = [
  {
    id: 1,
    name: 'Kira Voss',
    stageName: 'DJ Kira Voss',
    role: 'DJ / Producer',
    neighborhood: 'Brooklyn',
    rating: 4.9,
    reviewCount: 48,
    proposedRate: 185,
    yourRate: 180,
    gigTitle: 'Closing Set – Main Room',
    gigDate: 'Sat Jul 19',
    gigTime: '2AM–6AM',
    status: 'SHORTLISTED',
    appliedAt: '2h ago',
    unread: true,
    coverMessage:
      "I play deep house and techno with 6 years of NYC underground experience. My SoundCloud shows my mixing style — I'd love to close the main room.",
    initials: 'KV',
    color: 'bg-[#00FFCC]/20 text-[#00FFCC]',
    image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80',
  },
  {
    id: 2,
    name: 'Marcus Lee',
    role: 'DJ / Producer',
    neighborhood: 'Midtown',
    rating: 4.7,
    reviewCount: 31,
    proposedRate: 120,
    yourRate: 120,
    gigTitle: 'House Night Opener',
    gigDate: 'Fri Jul 18',
    gigTime: '10PM–1AM',
    status: 'HIRED',
    appliedAt: '5h ago',
    unread: false,
    coverMessage:
      "House and disco DJ — perfect for a warm-up set. I've played PHD and Output before and know how to build energy from the ground up.",
    initials: 'ML',
    color: 'bg-purple-500/20 text-purple-400',
    image: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&q=80',
  },
  {
    id: 3,
    name: 'Tony Reyes',
    stageName: 'DJ T-Rex',
    role: 'DJ / Producer',
    neighborhood: 'Harlem',
    rating: 4.7,
    reviewCount: 26,
    proposedRate: 160,
    yourRate: 180,
    gigTitle: 'Closing Set – Main Room',
    gigDate: 'Sat Jul 19',
    gigTime: '2AM–6AM',
    status: 'PENDING',
    appliedAt: '1d ago',
    unread: false,
    coverMessage:
      'Hip-hop and trap specialist but I can pivot to house for the right room. Bring my own 4-deck setup and lighting controller.',
    initials: 'TR',
    color: 'bg-red-500/20 text-red-400',
    image: 'https://images.unsplash.com/photo-1598387181032-a3103a2db5b3?w=400&q=80',
  },
  {
    id: 4,
    name: 'Sophia Cruz',
    role: 'Mixologist',
    neighborhood: 'Chelsea',
    rating: 4.8,
    reviewCount: 22,
    proposedRate: 65,
    yourRate: 65,
    gigTitle: 'VIP Lounge Mixologist',
    gigDate: 'Fri Jul 18',
    gigTime: '8PM–2AM',
    status: 'HIRED',
    appliedAt: '2d ago',
    unread: false,
    coverMessage:
      '4 years of craft cocktail experience in high-end VIP environments. Can design a signature menu for the event. I bring my own bar tools.',
    initials: 'SC',
    color: 'bg-orange-500/20 text-orange-400',
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
  },
  {
    id: 5,
    name: 'James Rivera',
    role: 'Security Lead',
    neighborhood: 'Queens',
    rating: 4.6,
    reviewCount: 17,
    proposedRate: 45,
    yourRate: 45,
    gigTitle: 'Door / Security Lead',
    gigDate: 'Sat Jul 19',
    gigTime: '9PM–4AM',
    status: 'HIRED',
    appliedAt: '2d ago',
    unread: false,
    coverMessage:
      '3 years at high-volume NYC venues. I can brief and coordinate a team on arrival. Licensed and references available on request.',
    initials: 'JR',
    color: 'bg-blue-500/20 text-blue-400',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80',
  },
  {
    id: 6,
    name: 'Yuna Kim',
    role: 'Go-Go Dancer',
    neighborhood: 'Williamsburg',
    rating: 4.5,
    reviewCount: 9,
    proposedRate: 115,
    yourRate: 120,
    gigTitle: 'Event Host / MC',
    gigDate: 'Sat Jul 19',
    gigTime: '9PM–3AM',
    status: 'PENDING',
    appliedAt: '3d ago',
    unread: false,
    coverMessage:
      'Experienced performer comfortable on elevated platforms and in themed environments. Available from 7PM. I have themed costume options.',
    initials: 'YK',
    color: 'bg-pink-500/20 text-pink-400',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400&q=80',
  },
];

const SUMMARY = [
  { label: 'Total Applied', value: '22', icon: <Users className="w-4 h-4" />, color: 'text-white' },
  { label: 'Shortlisted', value: '5', icon: <Zap className="w-4 h-4" />, color: 'text-[#00FFCC]' },
  { label: 'Hired', value: '3', icon: <UserCheck className="w-4 h-4" />, color: 'text-green-400' },
  {
    label: 'Pending Review',
    value: '14',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-yellow-400',
  },
];

const FILTER_TABS: { label: string; value: AppStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Shortlisted', value: 'SHORTLISTED' },
  { label: 'Hired', value: 'HIRED' },
  { label: 'Rejected', value: 'REJECTED' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueApplicantsPage() {
  const [apps, setApps] = useState(MOCK_APPLICATIONS);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AppStatus | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<number | null>(1);

  const filtered = apps.filter((a) => {
    if (filter !== 'ALL' && a.status !== filter) return false;
    if (
      search &&
      !a.name.toLowerCase().includes(search.toLowerCase()) &&
      !a.gigTitle.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const updateStatus = (id: number, status: AppStatus) => {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status, unread: false } : a)));
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Applicants</h1>
            <p className="text-xs text-white/40">Talent who applied to your gigs</p>
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

        <div className="flex-1 overflow-y-auto">
          {/* Summary */}
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
                placeholder="Search talent names or gig titles…"
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
                  <Users className="w-7 h-7 text-white/15" />
                </div>
                <p className="text-white/40 font-bold">No applications found</p>
                <p className="text-white/20 text-sm mt-1">Try a different filter or search term</p>
              </div>
            )}

            {filtered.map((app) => {
              const st = STATUS_CONFIG[app.status];
              const rateOk = app.proposedRate <= app.yourRate;
              const isExpanded = expanded === app.id;

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
                      {/* Talent image */}
                      <div className="w-24 sm:w-32 flex-shrink-0 relative overflow-hidden">
                        <img
                          src={app.image}
                          alt={app.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40" />
                        {app.unread && (
                          <div className="absolute top-2 left-2 w-2 h-2 bg-[#00FFCC] rounded-full" />
                        )}
                      </div>

                      <div className="flex-1 p-4 flex flex-col gap-2.5 min-w-0">
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-black text-white">
                                {app.stageName ?? app.name}
                              </p>
                              <div className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-[11px] text-white/50">
                                  {app.rating} ({app.reviewCount})
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-[#00FFCC] font-bold">{app.role}</p>
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
                            {app.neighborhood}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {app.gigDate} · {app.gigTime}
                          </span>
                          <span
                            className={cn(
                              'flex items-center gap-1 font-bold',
                              rateOk ? 'text-green-400' : 'text-yellow-400'
                            )}
                          >
                            <DollarSign className="w-3 h-3" />
                            Proposed ${app.proposedRate}/hr
                            {rateOk ? ' ✓' : ` (budget: $${app.yourRate})`}
                          </span>
                          <span className="flex items-center gap-1 text-white/25 italic">
                            <TrendingUp className="w-3 h-3" /> Applied {app.appliedAt}
                          </span>
                        </div>

                        {/* Applied for */}
                        <p className="text-[11px] text-white/40">
                          Applied for:{' '}
                          <span className="text-white/60 font-bold">{app.gigTitle}</span>
                        </p>

                        {/* Cover message (expandable) */}
                        <button
                          onClick={() => setExpanded(isExpanded ? null : app.id)}
                          className="text-left text-xs text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
                        >
                          <ChevronRight
                            className={cn(
                              'w-3 h-3 transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                          />
                          {isExpanded ? 'Hide message' : 'Show cover message'}
                        </button>
                        {isExpanded && (
                          <div className="p-3 rounded-lg bg-[#151515] border border-white/5 text-xs text-white/50 leading-relaxed italic">
                            "{app.coverMessage}"
                          </div>
                        )}

                        {/* Actions */}
                        {app.status === 'PENDING' || app.status === 'SHORTLISTED' ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, 'HIRED')}
                              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs h-7 px-3 flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Hire
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => updateStatus(app.id, 'SHORTLISTED')}
                              className={cn(
                                'font-bold text-xs h-7 px-3 flex items-center gap-1 transition-colors',
                                app.status === 'SHORTLISTED'
                                  ? 'bg-[#00FFCC]/10 text-[#00FFCC] border border-[#00FFCC]/30'
                                  : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                              )}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {app.status === 'SHORTLISTED' ? 'Shortlisted' : 'Shortlist'}
                            </Button>
                            <Link href="/dashboard/venue/messages">
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
                              onClick={() => updateStatus(app.id, 'REJECTED')}
                              className="bg-transparent text-red-400/60 hover:text-red-400 hover:bg-red-400/5 text-xs h-7 px-2 flex items-center gap-1 border border-transparent hover:border-red-400/20 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {app.status === 'HIRED' && (
                              <Link href="/dashboard/venue/messages">
                                <Button
                                  size="sm"
                                  className="bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 font-bold text-xs h-7 px-3 flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" /> Message Talent
                                </Button>
                              </Link>
                            )}
                            {app.status === 'REJECTED' && (
                              <Button
                                size="sm"
                                onClick={() => updateStatus(app.id, 'PENDING')}
                                className="bg-white/5 text-white/40 border border-white/10 hover:text-white text-xs h-7 px-3"
                              >
                                Undo Rejection
                              </Button>
                            )}
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
