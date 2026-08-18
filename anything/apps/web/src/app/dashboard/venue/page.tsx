'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DollarSign,
  Clock,
  BarChart3,
  Users,
  PlusCircle,
  Zap,
  TrendingUp,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Eye,
  UserCheck,
  Building2,
  Loader2,
  Send,
  Undo2,
  XCircle,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import ReviewDialog from '@/components/ReviewDialog';
import { cn } from '@/lib/utils';
import { type ApiGig, formatDate, formatRate, formatTimeRange } from '@/lib/gigs';
import { NotificationsBell } from '@/components/NotificationsBell';

// ─── Real data: the venue's own gigs (P1.3) ──────────────────────────────────

type GigStatus = ApiGig['status'];

const GIG_STATUS_MAP: Record<GigStatus, { label: string; color: string }> = {
  PUBLISHED: { label: 'Live', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  FILLED: { label: 'Filled', color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20' },
  DRAFT: { label: 'Draft', color: 'text-white/40 bg-white/5 border-white/10' },
  COMPLETED: { label: 'Done', color: 'text-white/40 bg-white/5 border-white/10' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

/** The next-step transitions we surface per status (server re-validates). */
const GIG_ACTIONS: Record<
  GigStatus,
  Array<{ to: GigStatus; label: string; icon: React.ReactNode; destructive?: boolean }>
> = {
  DRAFT: [
    { to: 'PUBLISHED', label: 'Publish', icon: <Send className="w-3 h-3" /> },
    { to: 'CANCELLED', label: 'Cancel', icon: <XCircle className="w-3 h-3" />, destructive: true },
  ],
  PUBLISHED: [
    { to: 'FILLED', label: 'Mark Filled', icon: <CheckCheck className="w-3 h-3" /> },
    { to: 'DRAFT', label: 'Unpublish', icon: <Undo2 className="w-3 h-3" /> },
    { to: 'CANCELLED', label: 'Cancel', icon: <XCircle className="w-3 h-3" />, destructive: true },
  ],
  FILLED: [
    { to: 'COMPLETED', label: 'Complete', icon: <CheckCircle2 className="w-3 h-3" /> },
    { to: 'PUBLISHED', label: 'Reopen', icon: <Undo2 className="w-3 h-3" /> },
    { to: 'CANCELLED', label: 'Cancel', icon: <XCircle className="w-3 h-3" />, destructive: true },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

// ─── Live ops: real shifts (P7) ──────────────────────────────────────────────

interface LiveShift {
  id: string;
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'CHECKED_IN' | 'CHECKED_OUT' | 'PAID';
  call_time: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  agreed_rate_cents: number;
  shift_pay_cents: number | null;
  gig_title: string;
  stage_name: string | null;
  primary_role: string | null;
}

const LIVE_STATUS_MAP: Record<LiveShift['status'], { label: string; color: string; dot: string }> =
  {
    SCHEDULED: { label: 'Scheduled', color: 'text-white/40', dot: 'bg-white/20' },
    IN_TRANSIT: { label: 'In Transit', color: 'text-[#00FFCC]', dot: 'bg-[#00FFCC]' },
    CHECKED_IN: { label: 'Working', color: 'text-green-400', dot: 'bg-green-400' },
    CHECKED_OUT: { label: 'Checked Out', color: 'text-white/50', dot: 'bg-white/30' },
    PAID: { label: 'Paid', color: 'text-[#00FFCC]', dot: 'bg-[#00FFCC]' },
  };

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  change,
  icon,
  muted,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  muted?: boolean;
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
              muted ? 'text-white/30' : 'text-green-400'
            )}
          >
            {!muted && <TrendingUp className="w-3 h-3" />}
            {change}
          </span>
        </div>
        <p className={cn('text-3xl font-black mb-1', muted ? 'text-white/30' : 'text-white')}>
          {value}
        </p>
        <p className="text-sm text-white/40 font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueDashboard() {
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ['venue-gigs'],
    queryFn: async () => {
      const res = await fetch('/api/venue/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<{ gigs: ApiGig[] }>;
    },
  });
  const gigs = useMemo(() => data?.gigs ?? [], [data]);

  // Live ops (P7): real shifts + the payouts-pending aggregate (P8).
  const { data: shiftsData } = useQuery({
    queryKey: ['venue-shifts'],
    queryFn: async () => {
      const res = await fetch('/api/venue/shifts');
      if (!res.ok) throw new Error('Failed to load shifts');
      return res.json() as Promise<{
        shifts: LiveShift[];
        payoutsPendingCents: number;
        payoutsPendingCount: number;
        paymentsLive?: boolean;
      }>;
    },
    refetchInterval: 15_000,
  });
  const shifts = shiftsData?.shifts ?? [];

  // Venue KPIs from the S6 event capture: time-to-hire + filling-rate trends.
  const { data: statsData } = useQuery({
    queryKey: ['venue-stats'],
    queryFn: async () => {
      const res = await fetch('/api/venue/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      return res.json() as Promise<{
        stats: {
          avgTimeToHireHours: number | null;
          window30d: { published: number; filled: number; applications: number };
          previous30d: { published: number; filled: number; applications: number };
        } | null;
      }>;
    },
    staleTime: 60_000,
  });
  const stats = statsData?.stats ?? null;

  const shiftTransition = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: 'CHECKED_IN' | 'CHECKED_OUT' }) => {
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
      toast.success(to === 'CHECKED_IN' ? 'Checked in' : 'Checked out — payout queued');
      void qc.invalidateQueries({ queryKey: ['venue-shifts'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const transition = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: GigStatus }) => {
      const res = await fetch(`/api/gigs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Status change failed');
      }
      return res.json();
    },
    onSuccess: (_result, variables) => {
      toast.success(`Gig ${GIG_STATUS_MAP[variables.to].label.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ['venue-gigs'] });
      void qc.invalidateQueries({ queryKey: ['gigs'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Real, derivable stats (P1.3) + S6 event-backed KPIs.
  const published = gigs.filter((g) => g.status === 'PUBLISHED').length;
  const drafts = gigs.filter((g) => g.status === 'DRAFT').length;
  const filledish = gigs.filter((g) => g.status === 'FILLED' || g.status === 'COMPLETED').length;
  const fillable = published + filledish;
  const openGigs = gigs.filter((g) => g.status !== 'CANCELLED');

  // Formatting for the S6 cards. Trend compares this 30-day window with the
  // previous one; both need data before a percentage is honest.
  const timeToHireLabel =
    stats?.avgTimeToHireHours == null
      ? null
      : stats.avgTimeToHireHours < 48
        ? `${stats.avgTimeToHireHours.toFixed(stats.avgTimeToHireHours < 10 ? 1 : 0)}h`
        : `${(stats.avgTimeToHireHours / 24).toFixed(1)}d`;
  const fillTrend = (() => {
    if (!stats) return null;
    const current = stats.window30d.published > 0
      ? stats.window30d.filled / stats.window30d.published
      : null;
    const previous = stats.previous30d.published > 0
      ? stats.previous30d.filled / stats.previous30d.published
      : null;
    if (current === null || previous === null || previous === 0) return null;
    const delta = Math.round(((current - previous) / previous) * 100);
    return delta === 0 ? '±0% vs last month' : `${delta > 0 ? '+' : ''}${delta}% vs last month`;
  })();

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-10">
          <div>
            <h1 className="text-lg font-bold">Venue Operations 🏙️</h1>
            <p className="text-xs text-white/40">{todayLabel}</p>
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
            <NotificationsBell role="venue" />
            <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/20 border border-[#00FFCC]/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#00FFCC]" />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Gigs"
              value={isPending ? '…' : String(published)}
              change={drafts > 0 ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'all published'}
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              label="Filling Rate"
              value={isPending ? '…' : fillable > 0 ? `${filledish} of ${fillable}` : '—'}
              change={fillTrend ?? (fillable > 0 ? 'gigs filled' : 'no open gigs yet')}
              icon={<BarChart3 className="w-5 h-5" />}
              muted={fillable === 0}
            />
            <StatCard
              label="Payouts Pending"
              value={
                shiftsData
                  ? `$${((shiftsData.payoutsPendingCents ?? 0) / 100).toFixed(0)}`
                  : '…'
              }
              change={
                shiftsData && shiftsData.payoutsPendingCount > 0
                  ? shiftsData.paymentsLive === false
                    ? // S14 (A3): the ledger runs, but no money moves unkeyed.
                      `${shiftsData.payoutsPendingCount} awaiting release — simulated, payments not live`
                    : `${shiftsData.payoutsPendingCount} awaiting release`
                  : 'no pending payouts'
              }
              icon={<DollarSign className="w-5 h-5" />}
              muted={!shiftsData || shiftsData.payoutsPendingCount === 0}
            />
            <StatCard
              label="Avg. Time to Hire"
              value={timeToHireLabel ?? '—'}
              change={
                timeToHireLabel
                  ? `${stats?.window30d.applications ?? 0} application${
                      (stats?.window30d.applications ?? 0) === 1 ? '' : 's'
                    } / 30d`
                  : 'no hires recorded yet'
              }
              icon={<Clock className="w-5 h-5" />}
              muted={timeToHireLabel === null}
            />
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
                  {isPending ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-5 h-5 text-[#00FFCC] animate-spin" />
                    </div>
                  ) : isError ? (
                    <div className="py-16 text-center text-white/40 text-sm">
                      Couldn't load your gigs — refresh to retry.
                    </div>
                  ) : openGigs.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-white/40 font-semibold text-sm">No gigs yet</p>
                      <p className="text-white/20 text-xs mt-1 mb-4">
                        Post your first gig and it shows up here.
                      </p>
                      <Link href="/dashboard/venue/create-gig">
                        <Button
                          size="sm"
                          className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs"
                        >
                          Post a Gig
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Table Header */}
                      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-white/5 text-[11px] font-bold uppercase tracking-widest text-white/30">
                        <span>Gig</span>
                        <span className="text-center">Applicants</span>
                        <span className="text-center">Status</span>
                        <span />
                      </div>

                      {/* Table Rows */}
                      <div className="divide-y divide-white/5">
                        {openGigs.map((gig) => {
                          const statusInfo = GIG_STATUS_MAP[gig.status];
                          const actions = GIG_ACTIONS[gig.status];
                          return (
                            <div
                              key={gig.id}
                              className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:items-center gap-3 sm:gap-4 p-4 hover:bg-white/[0.02] transition-colors group"
                            >
                              {/* Title & meta */}
                              <div>
                                <Link
                                  href={`/gigs/${gig.id}`}
                                  className="text-sm font-bold text-white group-hover:text-[#00FFCC] transition-colors"
                                >
                                  {gig.title}
                                </Link>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-white/40">
                                  {gig.role_needed && <span>{gig.role_needed}</span>}
                                  {formatDate(gig.start_time) && (
                                    <>
                                      <span>·</span>
                                      <span>{formatDate(gig.start_time)}</span>
                                    </>
                                  )}
                                  {formatTimeRange(gig.start_time, gig.end_time) && (
                                    <>
                                      <span>·</span>
                                      <span>{formatTimeRange(gig.start_time, gig.end_time)}</span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span className="text-white/60 font-semibold">
                                    {formatRate(gig)}
                                  </span>
                                </div>
                              </div>

                              {/* Applicants (real counts, P3) */}
                              <Link
                                href="/dashboard/venue/applicants"
                                className="text-center sm:mx-auto"
                              >
                                <div
                                  className={cn(
                                    'flex items-center gap-1 text-sm font-bold',
                                    (gig.applicant_count ?? 0) > 0
                                      ? 'text-white hover:text-[#00FFCC] transition-colors'
                                      : 'text-white/30'
                                  )}
                                >
                                  <Users className="w-3.5 h-3.5 sm:hidden md:block opacity-60" />
                                  {gig.applicant_count ?? 0}
                                  {(gig.pending_count ?? 0) > 0 && (
                                    <span className="text-[10px] font-black text-yellow-400/80">
                                      {gig.pending_count} new
                                    </span>
                                  )}
                                </div>
                              </Link>

                              {/* Status Badge */}
                              <span
                                className={cn(
                                  'text-[11px] font-bold px-2.5 py-1 rounded-full border w-fit sm:mx-auto',
                                  statusInfo.color
                                )}
                              >
                                {statusInfo.label}
                              </span>

                              {/* Actions */}
                              <div className="flex items-center gap-1 flex-wrap sm:justify-end">
                                <Link href={`/gigs/${gig.id}`}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`View ${gig.title}`}
                                    className="text-white/40 hover:text-white hover:bg-white/5 text-xs flex items-center gap-1 h-7 px-2"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                                {actions.map((action) => (
                                  <Button
                                    key={action.to}
                                    size="sm"
                                    variant="ghost"
                                    disabled={transition.isPending}
                                    onClick={() => transition.mutate({ id: gig.id, to: action.to })}
                                    className={cn(
                                      'text-xs flex items-center gap-1 h-7 px-2 font-bold',
                                      action.destructive
                                        ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10'
                                        : 'text-[#00FFCC]/80 hover:text-[#00FFCC] hover:bg-[#00FFCC]/10'
                                    )}
                                  >
                                    {action.icon}
                                    <span className="hidden lg:inline">{action.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
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
                        <p className="text-xs text-white/40">arriving with applications</p>
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
                        <p className="text-xs text-white/40">open inbox</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <Link href="/dashboard/venue/browse" className="col-span-1">
                  <Card className="bg-[#1E1E1E] border-white/5 hover:border-[#00FFCC]/20 transition-colors cursor-pointer group h-full">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 text-white/60" />
                      </div>
                      <div>
                        <p className="font-bold text-sm group-hover:text-[#00FFCC] transition-colors">
                          Browse Talent
                        </p>
                        <p className="text-xs text-white/40">find your next hire</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>

            {/* RIGHT – Live Operations (real shifts, P7) */}
            <div className="space-y-6">
              {/* Live Tonight */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">Active Operations</h2>
                    {shifts.some((s) => s.status === 'CHECKED_IN') && (
                      <span className="flex items-center gap-1.5 bg-green-400/10 text-green-400 border border-green-400/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                        Live
                      </span>
                    )}
                  </div>
                  <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                </div>
                <p className="text-[11px] text-white/30 -mt-2 mb-3">
                  Shifts created when you hire an applicant. Check talent in and out here — checkout
                  computes the payout ledger entry.
                </p>

                <div className="space-y-3">
                  {shifts.length === 0 && (
                    <Card className="bg-[#1E1E1E] border-white/5 border-dashed">
                      <CardContent className="p-6 text-center">
                        <UserCheck className="w-6 h-6 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/40">No shifts yet.</p>
                        <p className="text-xs text-white/25 mt-1">
                          Hire an applicant to schedule their shift.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  {shifts.map((shift) => {
                    const statusInfo = LIVE_STATUS_MAP[shift.status];
                    const done = shift.status === 'CHECKED_OUT' || shift.status === 'PAID';
                    const name = shift.stage_name ?? 'Talent';
                    const rateLabel = `$${(shift.agreed_rate_cents / 100).toFixed(0)}/hr`;
                    const callLabel = shift.call_time
                      ? new Date(shift.call_time).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'TBD';

                    return (
                      <Card
                        key={shift.id}
                        className={cn(
                          'border transition-colors',
                          done
                            ? 'bg-[#1A1A1A] border-white/5 opacity-70'
                            : 'bg-[#1E1E1E] border-white/5 hover:border-white/10'
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              {/* Avatar */}
                              <div className="w-9 h-9 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[#00FFCC] text-xs font-black">
                                  {name.split(' ')[0][0]}
                                  {name.split(' ')[1]?.[0] ?? ''}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-bold leading-tight">{name}</p>
                                <p className="text-xs text-white/40">
                                  {shift.primary_role ?? 'Talent'} · {shift.gig_title}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  statusInfo.dot,
                                  shift.status === 'CHECKED_IN' && 'pulse-dot'
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
                              Call: {callLabel}
                            </span>
                            {shift.shift_pay_cents !== null ? (
                              <span className="text-white/60 font-semibold">
                                Pay: ${(shift.shift_pay_cents / 100).toFixed(2)}
                              </span>
                            ) : (
                              <span className="font-bold text-[#00FFCC]">{rateLabel}</span>
                            )}
                          </div>

                          {(shift.status === 'SCHEDULED' || shift.status === 'IN_TRANSIT') && (
                            <Button
                              size="sm"
                              disabled={shiftTransition.isPending}
                              onClick={() =>
                                shiftTransition.mutate({ id: shift.id, to: 'CHECKED_IN' })
                              }
                              className="w-full text-xs font-bold bg-[#00FFCC]/15 text-[#00FFCC] hover:bg-[#00FFCC]/25 border border-[#00FFCC]/20"
                            >
                              <UserCheck className="w-3 h-3 mr-1" /> Check In
                            </Button>
                          )}
                          {shift.status === 'CHECKED_IN' && (
                            <Button
                              size="sm"
                              disabled={shiftTransition.isPending}
                              onClick={() =>
                                shiftTransition.mutate({ id: shift.id, to: 'CHECKED_OUT' })
                              }
                              className="w-full text-xs font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20"
                            >
                              <LogOut className="w-3 h-3 mr-1" /> Check Out
                            </Button>
                          )}
                          {shift.status === 'CHECKED_OUT' && (
                            <p className="text-[11px] text-white/40 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-[#00FFCC]" />
                              Payout held in escrow — releases 24h after checkout.
                            </p>
                          )}
                          {shift.status === 'PAID' && (
                            <p className="text-[11px] text-[#00FFCC] flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3" /> Payout released.
                            </p>
                          )}
                          {(shift.status === 'CHECKED_OUT' || shift.status === 'PAID') && (
                            /* S8: shift-scoped review of the talent */
                            <ReviewDialog
                              shiftId={shift.id}
                              counterpartLabel={shift.stage_name ?? 'this talent'}
                              trigger={
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full text-xs font-bold border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10"
                                >
                                  ★ Rate Talent
                                </Button>
                              }
                            />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
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
