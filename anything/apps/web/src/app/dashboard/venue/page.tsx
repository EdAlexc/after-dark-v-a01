'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Clock,
  BarChart3,
  Users,
  PlusCircle,
  Bell,
  Zap,
  TrendingUp,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Eye,
  UserCheck,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Mock Data ───────────────────────────────────────────────────────────────

const STATS = [
  {
    label: 'Payouts Pending',
    value: '$3,840',
    change: '4 gigs this week',
    positive: true,
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    label: 'Avg. Time to Hire',
    value: '1.4 hrs',
    change: '↓ 22% vs last month',
    positive: true,
    icon: <Clock className="w-5 h-5" />,
  },
  {
    label: 'Filling Rate',
    value: '94%',
    change: '+3% this month',
    positive: true,
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    label: 'Active Gigs',
    value: '6',
    change: '2 closing tonight',
    positive: false,
    icon: <Users className="w-5 h-5" />,
  },
];

type GigStatus = 'PUBLISHED' | 'FILLED' | 'DRAFT';

interface OpenGig {
  id: number;
  title: string;
  role: string;
  date: string;
  time: string;
  rate: string;
  applicants: number;
  shortlisted: number;
  status: GigStatus;
}

const OPEN_GIGS: OpenGig[] = [
  {
    id: 1,
    title: 'Closing Set – Main Room',
    role: 'DJ / Producer',
    date: 'Sat Jul 19',
    time: '2AM – 6AM',
    rate: '$180/hr',
    applicants: 14,
    shortlisted: 3,
    status: 'PUBLISHED',
  },
  {
    id: 2,
    title: 'House Night Opener',
    role: 'DJ / Producer',
    date: 'Fri Jul 18',
    time: '10PM – 1AM',
    rate: '$120/hr',
    applicants: 8,
    shortlisted: 1,
    status: 'PUBLISHED',
  },
  {
    id: 3,
    title: 'VIP Lounge Mixologist',
    role: 'Mixologist',
    date: 'Fri Jul 18',
    time: '8PM – 2AM',
    rate: '$65/hr + Tips',
    applicants: 6,
    shortlisted: 2,
    status: 'FILLED',
  },
  {
    id: 4,
    title: 'Door / Security Lead',
    role: 'Security',
    date: 'Sat Jul 19',
    time: '9PM – 4AM',
    rate: '$45/hr',
    applicants: 22,
    shortlisted: 5,
    status: 'PUBLISHED',
  },
  {
    id: 5,
    title: 'Rooftop Happy Hour DJ',
    role: 'DJ',
    date: 'Thu Jul 17',
    time: '5PM – 9PM',
    rate: '$100/hr',
    applicants: 3,
    shortlisted: 0,
    status: 'DRAFT',
  },
  {
    id: 6,
    title: 'Event Host / MC',
    role: 'Host / MC',
    date: 'Sat Jul 19',
    time: '9PM – 3AM',
    rate: '$90/hr',
    applicants: 9,
    shortlisted: 2,
    status: 'PUBLISHED',
  },
];

interface LiveTalent {
  id: number;
  name: string;
  role: string;
  callTime: string;
  status: 'ON_SITE' | 'CHECKED_IN' | 'AWAITING';
  hoursWorked?: number;
  rate: string;
}

const LIVE_TALENT: LiveTalent[] = [
  {
    id: 1,
    name: 'DJ Kira Voss',
    role: 'DJ / Producer',
    callTime: '10:00 PM',
    status: 'CHECKED_IN',
    hoursWorked: 2.5,
    rate: '$180/hr',
  },
  {
    id: 2,
    name: 'James R.',
    role: 'Security Lead',
    callTime: '9:00 PM',
    status: 'CHECKED_IN',
    hoursWorked: 3,
    rate: '$45/hr',
  },
  {
    id: 3,
    name: 'Sophia Cruz',
    role: 'Mixologist',
    callTime: '8:00 PM',
    status: 'ON_SITE',
    hoursWorked: 4,
    rate: '$65/hr',
  },
  {
    id: 4,
    name: 'DJ Marcus Lee',
    role: 'Closing Set',
    callTime: '2:00 AM',
    status: 'AWAITING',
    rate: '$220/hr',
  },
];

const GIG_STATUS_MAP: Record<GigStatus, { label: string; color: string }> = {
  PUBLISHED: { label: 'Live', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  FILLED: { label: 'Filled', color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20' },
  DRAFT: { label: 'Draft', color: 'text-white/40 bg-white/5 border-white/10' },
};

const LIVE_STATUS_MAP: Record<LiveTalent['status'], { label: string; color: string; dot: string }> =
  {
    CHECKED_IN: {
      label: 'Working',
      color: 'text-green-400',
      dot: 'bg-green-400',
    },
    ON_SITE: {
      label: 'On Site',
      color: 'text-[#00FFCC]',
      dot: 'bg-[#00FFCC]',
    },
    AWAITING: {
      label: 'Awaiting',
      color: 'text-white/40',
      dot: 'bg-white/20',
    },
  };

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  positive,
  icon,
}: {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card className="bg-[#1E1E1E] border-white/5 hover:border-white/10 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center text-[#00FFCC]">
            {icon}
          </div>
          <span
            className={cn(
              'text-xs font-semibold flex items-center gap-1',
              positive ? 'text-green-400' : 'text-yellow-400'
            )}
          >
            <TrendingUp className="w-3 h-3" />
            {change}
          </span>
        </div>
        <p className="text-3xl font-black text-white mb-1">{value}</p>
        <p className="text-sm text-white/40 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueDashboard() {
  const [checkedOutIds, setCheckedOutIds] = useState<number[]>([]);

  const handleCheckout = (id: number) => {
    setCheckedOutIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Venue Operations 🏙️</h1>
            <p className="text-xs text-white/40">Sunday, Jul 13, 2026 · Nebula NYC</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/venue/create-gig">
              <Button
                size="sm"
                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold hidden sm:flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                Post a Gig
              </Button>
            </Link>
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          {/* Main two-column layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT – Open Gigs Table (spans 2 cols) */}
            <div className="xl:col-span-2 space-y-6">
              {/* Open Gigs */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Open Gigs</h2>
                  <Link href="/dashboard/venue/create-gig">
                    <Button
                      size="sm"
                      className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      New Gig
                    </Button>
                  </Link>
                </div>

                <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                  {/* Table Header */}
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold uppercase tracking-widest text-white/30">
                    <span>Gig</span>
                    <span className="text-center">Applicants</span>
                    <span className="text-center">Shortlisted</span>
                    <span className="text-center">Status</span>
                    <span />
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-white/5">
                    {OPEN_GIGS.map((gig) => {
                      const statusInfo = GIG_STATUS_MAP[gig.status];
                      return (
                        <div
                          key={gig.id}
                          className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center gap-3 sm:gap-4 p-4 hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Title & meta */}
                          <div>
                            <p className="text-sm font-bold text-white group-hover:text-[#00FFCC] transition-colors">
                              {gig.title}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-white/40">
                              <span>{gig.role}</span>
                              <span>·</span>
                              <span>{gig.date}</span>
                              <span>·</span>
                              <span>{gig.time}</span>
                              <span>·</span>
                              <span className="text-white/60 font-semibold">{gig.rate}</span>
                            </div>
                          </div>

                          {/* Applicants */}
                          <div className="text-center sm:mx-auto">
                            <div className="flex items-center gap-1 text-sm font-bold text-white">
                              <Users className="w-3.5 h-3.5 text-white/40 sm:hidden md:block" />
                              {gig.applicants}
                            </div>
                            <p className="text-[10px] text-white/30 sm:block hidden">applied</p>
                          </div>

                          {/* Shortlisted */}
                          <div className="text-center sm:mx-auto">
                            <p className="text-sm font-bold text-[#00FFCC]">{gig.shortlisted}</p>
                            <p className="text-[10px] text-white/30 sm:block hidden">listed</p>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-1 rounded-full border w-fit',
                              statusInfo.color
                            )}
                          >
                            {statusInfo.label}
                          </span>

                          {/* Action */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/40 hover:text-white hover:bg-white/5 text-xs flex items-center gap-1 w-fit"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:block">Review</span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>

              {/* Quick Actions Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/dashboard/venue/applicants" className="col-span-1">
                  <Card className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group h-full">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#00FFCC]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <UserCheck className="w-5 h-5 text-[#00FFCC]" />
                      </div>
                      <div>
                        <p className="font-bold text-sm group-hover:text-[#00FFCC] transition-colors">
                          Review Applicants
                        </p>
                        <p className="text-xs text-white/40">12 new this week</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/dashboard/venue/messages" className="col-span-1">
                  <Card className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group h-full">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-white/60" />
                      </div>
                      <div>
                        <p className="font-bold text-sm group-hover:text-[#00FFCC] transition-colors">
                          Messages
                        </p>
                        <p className="text-xs text-white/40">2 unread</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/dashboard/venue/analytics" className="col-span-1">
                  <Card className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group h-full">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 text-white/60" />
                      </div>
                      <div>
                        <p className="font-bold text-sm group-hover:text-[#00FFCC] transition-colors">
                          Analytics
                        </p>
                        <p className="text-xs text-white/40">View reports</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>

            {/* RIGHT – Live Operations */}
            <div className="space-y-6">
              {/* Live Tonight */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">Live Tonight</h2>
                    <span className="flex items-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full pulse-dot" />
                      Live
                    </span>
                  </div>
                  <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                </div>

                <div className="space-y-3">
                  {LIVE_TALENT.map((talent) => {
                    const statusInfo = LIVE_STATUS_MAP[talent.status];
                    const isCheckedOut = checkedOutIds.includes(talent.id);

                    return (
                      <Card
                        key={talent.id}
                        className={cn(
                          'border transition-colors',
                          isCheckedOut
                            ? 'bg-[#1A1A1A] border-white/5 opacity-60'
                            : 'bg-[#1E1E1E] border-white/5 hover:border-white/10'
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              {/* Avatar */}
                              <div className="w-9 h-9 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[#00FFCC] text-xs font-black">
                                  {talent.name.split(' ')[0][0]}
                                  {talent.name.split(' ')[1]?.[0] ?? ''}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-bold leading-tight">{talent.name}</p>
                                <p className="text-xs text-white/40">{talent.role}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  statusInfo.dot,
                                  talent.status === 'CHECKED_IN' && 'pulse-dot'
                                )}
                              />
                              <span className={cn('text-[11px] font-bold', statusInfo.color)}>
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-white/40 mb-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Call: {talent.callTime}
                            </span>
                            {talent.hoursWorked !== undefined && (
                              <span className="text-white/60 font-semibold">
                                {talent.hoursWorked}h worked
                              </span>
                            )}
                            <span className="font-bold text-[#00FFCC]">{talent.rate}</span>
                          </div>

                          {talent.status !== 'AWAITING' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleCheckout(talent.id)}
                                className={cn(
                                  'flex-1 text-xs font-bold transition-all',
                                  isCheckedOut
                                    ? 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/10'
                                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20'
                                )}
                              >
                                {isCheckedOut ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Checked Out
                                  </>
                                ) : (
                                  <>
                                    <LogOut className="w-3 h-3 mr-1" /> Check Out
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {talent.status === 'AWAITING' && (
                            <div className="text-[11px] text-white/30 text-center py-1">
                              Expected at {talent.callTime}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Payout Summary */}
              <section>
                <h2 className="text-lg font-bold mb-4">Tonight's Payout</h2>
                <Card className="bg-[#1E1E1E] border-white/5">
                  <CardContent className="p-4 space-y-3">
                    {LIVE_TALENT.filter((t) => t.hoursWorked !== undefined).map((talent) => {
                      const rateNum = parseFloat(talent.rate.replace('$', '').replace('/hr', ''));
                      const total = (rateNum * (talent.hoursWorked ?? 0)).toFixed(0);
                      return (
                        <div key={talent.id} className="flex items-center justify-between text-sm">
                          <span className="text-white/60 font-medium truncate">{talent.name}</span>
                          <span className="font-bold text-white flex-shrink-0 ml-2">${total}</span>
                        </div>
                      );
                    })}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-sm font-bold text-white/60">Total Owed</span>
                      <span className="text-xl font-black text-[#00FFCC]">$1,070</span>
                    </div>
                    <Button className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-sm">
                      Release Payouts
                    </Button>
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </main>
      </div>

      {/* Pulse animation for live indicators */}
      <style jsx global>{`
        @keyframes pulse-anim {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.85);
          }
        }
        .pulse-dot {
          animation: pulse-anim 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
