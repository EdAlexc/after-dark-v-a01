'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  Loader2,
  Send,
  Undo2,
  XCircle,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';
import { type ApiGig, formatDate, formatRate, formatTimeRange } from '@/lib/gigs';

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

// ─── Sample data: live ops (real model lands in P5) ──────────────────────────

interface LiveTalent {
  id: number;
  name: string;
  role: string;
  callTime: string;
  status: 'ON_SITE' | 'CHECKED_IN' | 'AWAITING';
  hoursWorked?: number;
  rate: string;
}

const SAMPLE_LIVE_TALENT: LiveTalent[] = [
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
];

const LIVE_STATUS_MAP: Record<LiveTalent['status'], { label: string; color: string; dot: string }> =
  {
    CHECKED_IN: { label: 'Working', color: 'text-green-400', dot: 'bg-green-400' },
    ON_SITE: { label: 'On Site', color: 'text-[#00FFCC]', dot: 'bg-[#00FFCC]' },
    AWAITING: { label: 'Awaiting', color: 'text-white/40', dot: 'bg-white/20' },
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
  const [checkedOutIds, setCheckedOutIds] = useState<number[]>([]);

  const { data, isPending, isError } = useQuery({
    queryKey: ['venue-gigs'],
    queryFn: async () => {
      const res = await fetch('/api/venue/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<{ gigs: ApiGig[] }>;
    },
  });
  const gigs = useMemo(() => data?.gigs ?? [], [data]);

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

  const handleCheckout = (id: number) => {
    setCheckedOutIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Real, derivable stats (P1.3). Payouts (P5) and time-to-hire (P2) unlock later.
  const published = gigs.filter((g) => g.status === 'PUBLISHED').length;
  const drafts = gigs.filter((g) => g.status === 'DRAFT').length;
  const filledish = gigs.filter((g) => g.status === 'FILLED' || g.status === 'COMPLETED').length;
  const fillable = published + filledish;
  const openGigs = gigs.filter((g) => g.status !== 'CANCELLED');

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
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
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
            <StatCard
              label="Active Gigs"
              value={isPending ? '…' : String(published)}
              change={drafts > 0 ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'all published'}
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              label="Filling Rate"
              value={isPending ? '…' : fillable > 0 ? `${filledish} of ${fillable}` : '—'}
              change={fillable > 0 ? 'gigs filled' : 'no open gigs yet'}
              icon={<BarChart3 className="w-5 h-5" />}
              muted={fillable === 0}
            />
            <StatCard
              label="Payouts Pending"
              value="—"
              change="unlocks with payments"
              icon={<DollarSign className="w-5 h-5" />}
              muted
            />
            <StatCard
              label="Avg. Time to Hire"
              value="—"
              change="unlocks with applications"
              icon={<Clock className="w-5 h-5" />}
              muted
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

                              {/* Applicants (real counts arrive with P2) */}
                              <div className="text-center sm:mx-auto">
                                <div className="flex items-center gap-1 text-sm font-bold text-white/30">
                                  <Users className="w-3.5 h-3.5 text-white/20 sm:hidden md:block" />
                                  —
                                </div>
                              </div>

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

            {/* RIGHT – Live Operations (sample until P5 live-ops slice) */}
            <div className="space-y-6">
              {/* Live Tonight */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">Live Tonight</h2>
                    <span className="flex items-center gap-1.5 bg-white/5 text-white/40 border border-white/10 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                      Sample
                    </span>
                  </div>
                  <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                </div>
                <p className="text-[11px] text-white/30 -mt-2 mb-3">
                  Preview of live check-in/out — real shift tracking arrives with the live-ops
                  release.
                </p>

                <div className="space-y-3">
                  {SAMPLE_LIVE_TALENT.map((talent) => {
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
