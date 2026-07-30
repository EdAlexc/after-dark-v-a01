'use client';

import React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DollarSign,
  Briefcase,
  CalendarCheck,
  User,
  ArrowRight,
  Clock,
  MapPin,
  Bell,
  ChevronRight,
  Zap,
  LogIn,
  LogOut,
  Navigation,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';
import { type ApiGig, formatDate, formatRate, formatTimeRange } from '@/lib/gigs';

// ─── Types from the real APIs (P3/P7) ────────────────────────────────────────

interface TalentShift {
  id: string;
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PAID';
  call_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  agreed_rate_cents: number;
  shift_pay_cents: number | null;
  gig_title: string;
  gig_id: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_neighborhood: string | null;
  payout_status: 'PENDING' | 'HELD' | 'RELEASED' | 'FAILED' | null;
  payout_net_cents: number | null;
}

interface TalentApplication {
  id: string;
  gig_id: string;
  status: 'PENDING' | 'SHORTLISTED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  proposed_rate_cents: number | null;
  gig_title: string;
  start_time: string | null;
  end_time: string | null;
  base_rate: string | number | null;
  venue_name: string | null;
  venue_neighborhood: string | null;
}

interface TalentProfile {
  stage_name: string | null;
  profile_completion_pct: number | null;
}

const APPLICATION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
  },
  HIRED: { label: 'Hired', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  REJECTED: { label: 'Rejected', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  WITHDRAWN: { label: 'Withdrawn', color: 'text-white/40 bg-white/5 border-white/10' },
};

const SHIFT_STATUS_MAP: Record<TalentShift['status'], { label: string; color: string }> = {
  SCHEDULED: { label: 'Scheduled', color: 'text-white/40' },
  IN_TRANSIT: { label: 'In Transit', color: 'text-[#00FFCC]' },
  CHECKED_IN: { label: 'Checked In', color: 'text-green-400' },
  CHECKED_OUT: { label: 'Checked Out', color: 'text-white/50' },
  PAID: { label: 'Paid', color: 'text-[#00FFCC]' },
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
              'text-xs font-semibold flex items-center gap-1 text-right',
              positive ? 'text-green-400' : 'text-white/40'
            )}
          >
            {positive && <TrendingUp className="w-3 h-3" />}
            {change}
          </span>
        </div>
        <p className="text-3xl font-black text-white mb-1">{value}</p>
        <p className="text-sm text-white/40 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TalentDashboard() {
  const qc = useQueryClient();

  const { data: profileData } = useQuery({
    queryKey: ['talent-profile'],
    queryFn: async () => {
      const res = await fetch('/api/talent/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json() as Promise<{ profile: TalentProfile | null }>;
    },
  });
  const profile = profileData?.profile ?? null;
  const completion = profile?.profile_completion_pct ?? 0;

  const { data: shiftsData } = useQuery({
    queryKey: ['talent-shifts'],
    queryFn: async () => {
      const res = await fetch('/api/talent/shifts');
      if (!res.ok) throw new Error('Failed to load shifts');
      return res.json() as Promise<{ shifts: TalentShift[] }>;
    },
    refetchInterval: 15_000,
  });
  const shifts = shiftsData?.shifts ?? [];

  const { data: appsData } = useQuery({
    queryKey: ['talent-applications'],
    queryFn: async () => {
      const res = await fetch('/api/talent/applications');
      if (!res.ok) throw new Error('Failed to load applications');
      return res.json() as Promise<{ applications: TalentApplication[] }>;
    },
  });
  const applications = appsData?.applications ?? [];

  const { data: gigsData } = useQuery({
    queryKey: ['gigs', 'dashboard-hot'],
    queryFn: async () => {
      const res = await fetch('/api/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<{ gigs: ApiGig[] }>;
    },
  });
  const hotGigs = (gigsData?.gigs ?? []).slice(0, 3);

  const shiftTransition = useMutation({
    mutationFn: async ({
      id,
      to,
    }: {
      id: string;
      to: 'IN_TRANSIT' | 'CHECKED_IN' | 'CHECKED_OUT';
    }) => {
      const res = await fetch(`/api/shifts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, idempotency_key: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Shift update failed');
      }
      return to;
    },
    onSuccess: (to) => {
      toast.success(
        to === 'IN_TRANSIT'
          ? 'Marked in transit'
          : to === 'CHECKED_IN'
            ? 'Checked in — have a great night'
            : 'Checked out — payout is in escrow'
      );
      void qc.invalidateQueries({ queryKey: ['talent-shifts'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Derived, real stats (wireframe p8): earnings from the payout ledger,
  // application + booking counts from live rows.
  const releasedCents = shifts
    .filter((s) => s.payout_status === 'RELEASED')
    .reduce((sum, s) => sum + (s.payout_net_cents ?? 0), 0);
  const heldCents = shifts
    .filter((s) => s.payout_status === 'HELD')
    .reduce((sum, s) => sum + (s.payout_net_cents ?? 0), 0);
  const activeApps = applications.filter(
    (a) => a.status === 'PENDING' || a.status === 'SHORTLISTED'
  );
  const upcoming = shifts.filter(
    (s) => s.status === 'SCHEDULED' || s.status === 'IN_TRANSIT' || s.status === 'CHECKED_IN'
  );
  const recentApplications = applications.slice(0, 4);
  const visibleShifts = shifts.slice(0, 4);

  const displayName = profile?.stage_name || 'there';
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Good evening, {displayName} 👋</h1>
            <p className="text-xs text-white/40">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/talent/browse"
              className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5"
              aria-label="Browse gigs"
            >
              <Bell className="w-4 h-4 text-white/60" />
            </Link>
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Profile Completion Banner */}
          {completion < 100 && (
            <div className="bg-[#1E1E1E] border border-[#00FFCC]/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-[#00FFCC] mb-2">
                  Complete your profile to unlock more gigs
                </p>
                <Progress value={completion} className="h-1.5 bg-white/10" />
                <p className="text-xs text-white/40 mt-1.5">
                  {completion}% complete — filled-out profiles get shortlisted more often
                </p>
              </div>
              <Link href="/dashboard/talent/profile">
                <Button
                  size="sm"
                  className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold flex-shrink-0"
                >
                  Finish Profile
                </Button>
              </Link>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Earnings"
              value={dollars(releasedCents)}
              change={heldCents > 0 ? `${dollars(heldCents)} in escrow` : 'released payouts'}
              positive={releasedCents > 0}
              icon={<DollarSign className="w-5 h-5" />}
            />
            <StatCard
              label="Active Applications"
              value={String(activeApps.length)}
              change={`${applications.length} total`}
              positive={activeApps.length > 0}
              icon={<Briefcase className="w-5 h-5" />}
            />
            <StatCard
              label="Upcoming Gigs"
              value={String(upcoming.length)}
              change={upcoming.length > 0 ? 'from hired applications' : 'apply to get booked'}
              positive={upcoming.length > 0}
              icon={<CalendarCheck className="w-5 h-5" />}
            />
            <StatCard
              label="Profile Completion"
              value={`${completion}%`}
              change={completion >= 100 ? 'all set' : 'finish to rank higher'}
              positive={completion >= 100}
              icon={<User className="w-5 h-5" />}
            />
          </div>

          {/* Main Grid: Bookings + Applications | Hot Gigs */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left column (2/3) */}
            <div className="xl:col-span-2 space-y-6">
              {/* Upcoming Bookings (real shifts, P7) */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Upcoming Bookings</h2>
                  <Link
                    href="/dashboard/talent/schedule"
                    className="text-xs text-[#00FFCC] font-semibold flex items-center gap-1 hover:underline"
                  >
                    View Schedule <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {visibleShifts.length === 0 && (
                    <Card className="bg-[#1E1E1E] border-white/5 border-dashed">
                      <CardContent className="p-6 text-center">
                        <CalendarCheck className="w-6 h-6 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/40">No bookings yet.</p>
                        <p className="text-xs text-white/25 mt-1">
                          When a venue hires you, your shift appears here with live check-in.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  {visibleShifts.map((shift) => {
                    const statusInfo = SHIFT_STATUS_MAP[shift.status];
                    const when = shift.call_time ?? shift.start_time;
                    return (
                      <Card
                        key={shift.id}
                        className="bg-[#1E1E1E] border-white/5 overflow-hidden group hover:border-white/10 transition-colors"
                      >
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Link
                                href={`/gigs/${shift.gig_id}`}
                                className="text-sm font-bold group-hover:text-[#00FFCC] transition-colors"
                              >
                                {shift.gig_title}
                              </Link>
                              <span className={cn('text-[11px] font-bold', statusInfo.color)}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {shift.venue_name ?? 'Venue'}
                                {shift.venue_neighborhood ? `, ${shift.venue_neighborhood}` : ''}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {when
                                  ? new Date(when).toLocaleString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })
                                  : 'TBD'}
                              </span>
                              <span className="flex items-center gap-1 text-white/70 font-semibold">
                                <DollarSign className="w-3 h-3 text-[#00FFCC]" />
                                {shift.shift_pay_cents !== null
                                  ? `${dollars(shift.shift_pay_cents)} earned`
                                  : `$${(shift.agreed_rate_cents / 100).toFixed(0)}/hr`}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {shift.status === 'SCHEDULED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={shiftTransition.isPending}
                                onClick={() =>
                                  shiftTransition.mutate({ id: shift.id, to: 'IN_TRANSIT' })
                                }
                                className="border-white/10 hover:bg-white/5 text-xs font-bold"
                              >
                                <Navigation className="w-3.5 h-3.5 mr-1" /> On My Way
                              </Button>
                            )}
                            {(shift.status === 'SCHEDULED' || shift.status === 'IN_TRANSIT') && (
                              <Button
                                size="sm"
                                disabled={shiftTransition.isPending}
                                onClick={() =>
                                  shiftTransition.mutate({ id: shift.id, to: 'CHECKED_IN' })
                                }
                                className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs"
                              >
                                <LogIn className="w-3.5 h-3.5 mr-1" /> Check In
                              </Button>
                            )}
                            {shift.status === 'CHECKED_IN' && (
                              <Button
                                size="sm"
                                disabled={shiftTransition.isPending}
                                onClick={() =>
                                  shiftTransition.mutate({ id: shift.id, to: 'CHECKED_OUT' })
                                }
                                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-bold text-xs"
                              >
                                <LogOut className="w-3.5 h-3.5 mr-1" /> Check Out
                              </Button>
                            )}
                            {(shift.status === 'CHECKED_OUT' || shift.status === 'PAID') && (
                              <span className="text-[11px] text-white/40 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#00FFCC]" />
                                {shift.status === 'PAID' || shift.payout_status === 'RELEASED'
                                  ? 'Payout released'
                                  : 'Payout in escrow (24h)'}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              {/* Active Applications (real, P3) */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">My Applications</h2>
                  <Link
                    href="/dashboard/talent/applicants"
                    className="text-xs text-[#00FFCC] font-semibold flex items-center gap-1 hover:underline"
                  >
                    Manage All <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <Card className="bg-[#1E1E1E] border-white/5 overflow-hidden">
                  {recentApplications.length === 0 ? (
                    <CardContent className="p-6 text-center">
                      <Briefcase className="w-6 h-6 text-white/20 mx-auto mb-2" />
                      <p className="text-sm text-white/40">No applications yet.</p>
                      <Link
                        href="/dashboard/talent/browse"
                        className="text-xs text-[#00FFCC] font-semibold hover:underline"
                      >
                        Browse open gigs →
                      </Link>
                    </CardContent>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {recentApplications.map((app) => {
                        const statusInfo =
                          APPLICATION_STATUS_MAP[app.status] ?? APPLICATION_STATUS_MAP.PENDING;
                        return (
                          <Link
                            key={app.id}
                            href={`/gigs/${app.gig_id}`}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate mb-1">
                                {app.gig_title}
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {app.venue_name ?? 'Venue'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(app.start_time)} ·{' '}
                                  {formatTimeRange(app.start_time, app.end_time)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-sm font-bold text-white/70">
                                {app.proposed_rate_cents !== null
                                  ? `$${(app.proposed_rate_cents / 100).toFixed(0)}/hr`
                                  : formatRate({ base_rate: app.base_rate ?? 0, tips_included: false })}
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
                          </Link>
                        );
                      })}
                    </div>
                  )}
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
                      className="w-full bg-transparent text-white border-white/10 hover:bg-white/5 hover:text-white justify-between font-semibold"
                    >
                      Manage Availability <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href="/dashboard/talent/messages">
                    <Button
                      variant="outline"
                      className="w-full bg-transparent text-white border-white/10 hover:bg-white/5 hover:text-white justify-between font-semibold"
                    >
                      Messages <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </section>

              {/* Hot Gigs Tonight (real listings) */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Hot Tonight</h2>
                  <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                </div>
                <div className="space-y-3">
                  {hotGigs.length === 0 && (
                    <p className="text-xs text-white/30">No open gigs right now — check back soon.</p>
                  )}
                  {hotGigs.map((gig) => (
                    <Link key={gig.id} href={`/gigs/${gig.id}`} className="block">
                      <Card className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors group cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-bold group-hover:text-[#00FFCC] transition-colors leading-tight">
                              {gig.title}
                            </p>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ml-2 bg-[#00FFCC] text-black">
                              OPEN
                            </span>
                          </div>
                          <p className="text-xs text-white/40 mb-3">
                            {gig.venue_name ?? 'Venue'}
                            {gig.venue_neighborhood ? ` · ${gig.venue_neighborhood}` : ''}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-xs text-white/60">
                              <Clock className="w-3 h-3" />
                              {formatDate(gig.start_time)}
                            </span>
                            <span className="text-sm font-black text-[#00FFCC]">
                              {formatRate(gig)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
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

              {/* Earnings summary (real payout ledger, P8) */}
              <section>
                <h2 className="text-lg font-bold mb-4">Earnings</h2>
                <Card className="bg-[#1E1E1E] border-white/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/40">Released to you</p>
                        <p className="text-lg font-black text-white">{dollars(releasedCents)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40">Held in escrow</p>
                        <p className="text-sm font-bold text-[#00FFCC]">{dollars(heldCents)}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/30 border-t border-white/5 pt-3">
                      Net of the 5% marketplace fee. Escrowed payouts release 24 hours after
                      checkout.
                    </p>
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
