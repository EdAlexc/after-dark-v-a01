'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Briefcase,
  CalendarCheck,
  User,
  ArrowRight,
  Clock,
  MapPin,
  XCircle,
  Bell,
  ChevronRight,
  Zap,
  TrendingUp,
  LogIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Mock Data ───────────────────────────────────────────────────────────────

const STATS = [
  {
    label: 'Total Earnings',
    value: '$14,220',
    change: '+12% this month',
    positive: true,
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    label: 'Active Applications',
    value: '7',
    change: '3 awaiting reply',
    positive: true,
    icon: <Briefcase className="w-5 h-5" />,
  },
  {
    label: 'Upcoming Gigs',
    value: '4',
    change: 'Next: Tonight 10PM',
    positive: true,
    icon: <CalendarCheck className="w-5 h-5" />,
  },
  {
    label: 'Profile Completion',
    value: '78%',
    change: '2 sections missing',
    positive: false,
    icon: <User className="w-5 h-5" />,
  },
];

const APPLICATION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
  },
  HIRED: { label: 'Hired', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  REJECTED: { label: 'Rejected', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

const ACTIVE_APPLICATIONS = [
  {
    id: 1,
    gigTitle: 'Closing Set – Nebula NYC',
    venue: 'Nebula NYC',
    neighborhood: 'Midtown',
    date: 'Sat, Jul 19',
    time: '2AM – 6AM',
    proposedRate: '$180/hr',
    status: 'SHORTLISTED',
  },
  {
    id: 2,
    gigTitle: 'House Night – The Standard',
    venue: 'The Standard',
    neighborhood: 'Meatpacking',
    date: 'Fri, Jul 18',
    time: '10PM – 3AM',
    proposedRate: '$150/hr',
    status: 'PENDING',
  },
  {
    id: 3,
    gigTitle: 'Rooftop Sunset Set',
    venue: '230 Fifth',
    neighborhood: 'Flatiron',
    date: 'Thu, Jul 17',
    time: '6PM – 10PM',
    proposedRate: '$120/hr',
    status: 'HIRED',
  },
  {
    id: 4,
    gigTitle: 'Private Event – Brooklyn',
    venue: 'Output BK',
    neighborhood: 'Williamsburg',
    date: 'Wed, Jul 16',
    time: '10PM – 4AM',
    proposedRate: '$200/hr',
    status: 'REJECTED',
  },
];

const UPCOMING_GIGS = [
  {
    id: 1,
    title: 'Prime Time DJ Set',
    venue: 'Nebula NYC',
    neighborhood: 'Midtown',
    date: 'Tonight',
    time: '10:00 PM',
    endTime: '2:00 AM',
    rate: '$180/hr',
    canCheckIn: true,
    image: 'https://raw.createusercontent.com/67c177f0-1e58-41db-8e21-40fab26107c5/',
  },
  {
    id: 2,
    title: 'Rooftop Sunset Set',
    venue: '230 Fifth',
    neighborhood: 'Flatiron',
    date: 'Thu Jul 17',
    time: '6:00 PM',
    endTime: '10:00 PM',
    rate: '$120/hr',
    canCheckIn: false,
    image: 'https://raw.createusercontent.com/1fdc9fa2-03ef-4a17-9d5f-8d0f8468f505/',
  },
  {
    id: 3,
    title: 'House Night Main Stage',
    venue: 'The Standard',
    neighborhood: 'Meatpacking',
    date: 'Fri Jul 18',
    time: '10:00 PM',
    endTime: '3:00 AM',
    rate: '$150/hr',
    canCheckIn: false,
    image: 'https://raw.createusercontent.com/ef893642-e48b-430c-a4f2-ce5f25f143ad/',
  },
];

const HOT_GIGS_TONIGHT = [
  {
    id: 1,
    title: 'Emergency DJ Fill',
    venue: 'PHD Rooftop',
    neighborhood: 'Downtown',
    time: '11PM',
    rate: '$220/hr',
    urgency: 'HOT',
  },
  {
    id: 2,
    title: 'Afrobeats Night',
    venue: 'Limelight',
    neighborhood: 'Chelsea',
    time: '9PM',
    rate: '$140/hr',
    urgency: 'URGENT',
  },
  {
    id: 3,
    title: 'VIP Lounge Set',
    venue: 'Butter Group',
    neighborhood: 'Meatpacking',
    time: '8PM',
    rate: '$100/hr',
    urgency: 'NEW',
  },
];

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

export default function TalentDashboard() {
  const [checkedIn, setCheckedIn] = useState<number[]>([]);

  const handleCheckIn = (gigId: number) => {
    setCheckedIn((prev) =>
      prev.includes(gigId) ? prev.filter((id) => id !== gigId) : [...prev, gigId]
    );
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Good evening, Marcus 👋</h1>
            <p className="text-xs text-white/40">Sunday, Jul 13, 2026</p>
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

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Profile Completion Banner */}
          <div className="bg-[#1E1E1E] border border-[#00FFCC]/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-bold text-[#00FFCC] mb-2">
                Complete your profile to unlock more gigs
              </p>
              <Progress value={78} className="h-1.5 bg-white/10" />
              <p className="text-xs text-white/40 mt-1.5">
                78% complete — Add SoundCloud & media gallery to finish
              </p>
            </div>
            <Button
              size="sm"
              className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold flex-shrink-0"
            >
              Finish Profile
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STATS.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          {/* Main Grid: Applications + Upcoming | Hot Gigs */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left column (2/3) */}
            <div className="xl:col-span-2 space-y-6">
              {/* Upcoming Gigs */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Upcoming Gigs</h2>
                  <Link
                    href="/dashboard/talent/schedule"
                    className="text-xs text-[#00FFCC] font-semibold flex items-center gap-1 hover:underline"
                  >
                    View Schedule <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {UPCOMING_GIGS.map((gig) => {
                    const isCheckedIn = checkedIn.includes(gig.id);
                    return (
                      <Card
                        key={gig.id}
                        className="bg-[#1E1E1E] border-white/5 overflow-hidden group hover:border-white/10 transition-colors"
                      >
                        <CardContent className="p-0">
                          <div className="flex items-stretch">
                            {/* Image */}
                            <div className="w-20 sm:w-28 flex-shrink-0 relative overflow-hidden">
                              <img
                                src={gig.image}
                                alt={gig.title}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/30" />
                            </div>
                            {/* Info */}
                            <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  {gig.date === 'Tonight' && (
                                    <span className="text-[10px] font-black uppercase bg-[#00FFCC] text-black px-2 py-0.5 rounded-full">
                                      Tonight
                                    </span>
                                  )}
                                  <p className="text-sm font-bold group-hover:text-[#00FFCC] transition-colors">
                                    {gig.title}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {gig.venue}, {gig.neighborhood}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {gig.time} – {gig.endTime}
                                  </span>
                                  <span className="flex items-center gap-1 text-white/70 font-semibold">
                                    <DollarSign className="w-3 h-3 text-[#00FFCC]" />
                                    {gig.rate}
                                  </span>
                                </div>
                              </div>
                              {gig.canCheckIn && (
                                <Button
                                  size="sm"
                                  onClick={() => handleCheckIn(gig.id)}
                                  className={cn(
                                    'flex-shrink-0 font-bold text-xs transition-all',
                                    isCheckedIn
                                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                                      : 'bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90'
                                  )}
                                >
                                  {isCheckedIn ? (
                                    <>
                                      <XCircle className="w-3.5 h-3.5 mr-1" />
                                      Check Out
                                    </>
                                  ) : (
                                    <>
                                      <LogIn className="w-3.5 h-3.5 mr-1" />
                                      Check In
                                    </>
                                  )}
                                </Button>
                              )}
                              {!gig.canCheckIn && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="flex-shrink-0 text-white/30 hover:text-white/50 text-xs"
                                >
                                  {gig.date}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Active Applications */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Active Applications</h2>
                  <span className="text-xs text-white/40 font-medium">
                    {ACTIVE_APPLICATIONS.length} total
                  </span>
                </div>
                <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                  <div className="divide-y divide-white/5">
                    {ACTIVE_APPLICATIONS.map((app) => {
                      const statusInfo = APPLICATION_STATUS_MAP[app.status];
                      return (
                        <div
                          key={app.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate mb-1">
                              {app.gigTitle}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {app.venue}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {app.date} · {app.time}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm font-bold text-white/70">
                              {app.proposedRate}
                            </span>
                            <span
                              className={cn(
                                'text-[11px] font-bold px-2.5 py-1 rounded-full border',
                                statusInfo.color
                              )}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>
            </div>

            {/* Right column (1/3) */}
            <div className="space-y-6">
              {/* Quick actions */}
              <section>
                <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
                <div className="space-y-2">
                  <Link href="/dashboard/talent/browse">
                    <Button className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold justify-between">
                      Browse Gigs <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/dashboard/talent/schedule">
                    <Button
                      variant="outline"
                      className="w-full border-white/10 hover:bg-white/5 justify-between font-semibold"
                    >
                      Manage Availability <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/dashboard/talent/messages">
                    <Button
                      variant="outline"
                      className="w-full border-white/10 hover:bg-white/5 justify-between font-semibold"
                    >
                      Messages
                      <span className="bg-[#00FFCC] text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                        3
                      </span>
                    </Button>
                  </Link>
                </div>
              </section>

              {/* Hot Gigs Tonight */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Hot Tonight</h2>
                  <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                </div>
                <div className="space-y-3">
                  {HOT_GIGS_TONIGHT.map((gig) => (
                    <Card
                      key={gig.id}
                      className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors group cursor-pointer"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-bold group-hover:text-[#00FFCC] transition-colors leading-tight">
                            {gig.title}
                          </p>
                          <span
                            className={cn(
                              'text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ml-2',
                              gig.urgency === 'HOT'
                                ? 'bg-red-500 text-white'
                                : gig.urgency === 'URGENT'
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-[#00FFCC] text-black'
                            )}
                          >
                            {gig.urgency}
                          </span>
                        </div>
                        <p className="text-xs text-white/40 mb-3">
                          {gig.venue} · {gig.neighborhood}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-xs text-white/60">
                            <Clock className="w-3 h-3" />
                            {gig.time}
                          </span>
                          <span className="text-sm font-black text-[#00FFCC]">{gig.rate}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Link href="/dashboard/talent/browse">
                  <Button
                    variant="ghost"
                    className="w-full mt-3 text-white/40 hover:text-[#00FFCC] text-xs font-semibold"
                  >
                    See all listings <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </section>

              {/* Earnings mini chart placeholder */}
              <section>
                <h2 className="text-lg font-bold mb-4">This Month</h2>
                <Card className="bg-[#1E1E1E] border-white/5">
                  <CardContent className="p-4">
                    <div className="flex items-end justify-between gap-1 h-20">
                      {[40, 70, 55, 80, 65, 90, 100, 75, 85, 60, 95, 78].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-[#00FFCC]/20 rounded-sm relative overflow-hidden"
                          style={{ height: `${h}%` }}
                        >
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-[#00FFCC]"
                            style={{ height: i === 11 ? '100%' : '40%' }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <div>
                        <p className="text-xs text-white/40">Total Earned</p>
                        <p className="text-lg font-black text-white">$14,220</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40">After 5% Fee</p>
                        <p className="text-sm font-bold text-[#00FFCC]">$13,509</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
