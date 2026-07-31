'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Users,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import DashboardSidebar from '@/components/DashboardSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type GigStatus = 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'COMPLETED' | 'CANCELLED';

/** Shape served by GET /api/venue/gigs (P1.3). */
interface ApiGig {
  id: number;
  title: string;
  role_needed: string;
  start_time: string | null;
  end_time: string | null;
  base_rate: string | number | null;
  tips_included: boolean | null;
  status: GigStatus;
  applicant_count: number;
  shortlisted_count: number;
  pending_count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<GigStatus, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Draft', color: 'text-white/40 bg-white/5 border-white/10', dot: 'bg-white/20' },
  PUBLISHED: {
    label: 'Live',
    color: 'text-green-400 bg-green-400/10 border-green-400/20',
    dot: 'bg-green-400',
  },
  FILLED: {
    label: 'Filled',
    color: 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20',
    dot: 'bg-[#00FFCC]',
  },
  COMPLETED: {
    label: 'Done',
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    dot: 'bg-blue-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-400 bg-red-400/10 border-red-400/20',
    dot: 'bg-red-400',
  },
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Local-date key for a gig's start time (calendar is in the viewer's zone). */
function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return buildKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return 'Time TBD';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return end ? `${fmt(start)}–${fmt(end)}` : fmt(start);
}

function formatRate(rate: string | number | null, tips: boolean | null): string {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return 'Rate TBD';
  return `$${value}/hr${tips ? ' + Tips' : ''}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueSchedulePage() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<number | null>(today.getDate());

  // Real gigs — same source as the dashboard's Open Gigs table (S4; was mock).
  const { data, isPending, isError } = useQuery({
    queryKey: ['venue-gigs'],
    queryFn: async () => {
      const res = await fetch('/api/venue/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      return res.json() as Promise<{ gigs: ApiGig[] }>;
    },
  });

  /** Gigs grouped by local start date; undated gigs are listed separately. */
  const { byDay, undated } = useMemo(() => {
    const map: Record<string, ApiGig[]> = {};
    const noDate: ApiGig[] = [];
    for (const gig of data?.gigs ?? []) {
      if (!gig.start_time) {
        noDate.push(gig);
        continue;
      }
      const key = dayKeyOf(gig.start_time);
      (map[key] ??= []).push(gig);
    }
    return { byDay: map, undated: noDate };
  }, [data]);

  const cells = useMemo<(number | null)[]>(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const result: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  const selectedKey = selected !== null ? buildKey(year, month, selected) : null;
  const selectedGigs = selectedKey ? (byDay[selectedKey] ?? []) : [];

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
    setSelected(null);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
    setSelected(null);
  };

  const gigsForDay = (day: number) => byDay[buildKey(year, month, day)] ?? [];

  const primaryStatusForDay = (day: number): GigStatus | null => {
    const gigs = gigsForDay(day);
    if (gigs.length === 0) return null;
    const priority: GigStatus[] = ['PUBLISHED', 'FILLED', 'DRAFT', 'COMPLETED', 'CANCELLED'];
    for (const p of priority) {
      if (gigs.some((g) => g.status === p)) return p;
    }
    return gigs[0].status;
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Gig Calendar</h1>
            <p className="text-xs text-white/40">All posted gigs and scheduling</p>
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
          </div>
        </header>

        {/* Main layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── Calendar ─────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
            {/* Month nav */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={prevMonth}
                  aria-label="Previous month"
                  className="w-8 h-8 rounded-lg bg-[#1E1E1E] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-white/60" />
                </button>
                <h2 className="text-lg font-black">
                  {MONTH_NAMES[month]} {year}
                </h2>
                <button
                  onClick={nextMonth}
                  aria-label="Next month"
                  className="w-8 h-8 rounded-lg bg-[#1E1E1E] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <button
                onClick={() => {
                  setYear(today.getFullYear());
                  setMonth(today.getMonth());
                  setSelected(today.getDate());
                }}
                className="text-xs font-bold text-[#00FFCC] hover:underline"
              >
                Today
              </button>
            </div>

            {isError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">
                  Could not load your gigs. Refresh to try again.
                </p>
              </div>
            )}

            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-bold text-white/30 py-1.5 uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="aspect-[1/1.15] rounded-xl" />;
                }
                const dayGigs = gigsForDay(day);
                const count = dayGigs.length;
                const primaryStatus = primaryStatusForDay(day);
                const isToday =
                  year === today.getFullYear() &&
                  month === today.getMonth() &&
                  day === today.getDate();
                const isSelected = selected === day;
                const key = buildKey(year, month, day);

                return (
                  <button
                    key={key}
                    onClick={() => setSelected(day)}
                    className={cn(
                      'aspect-[1/1.15] rounded-xl p-2 flex flex-col items-start transition-all border text-left overflow-hidden relative',
                      isSelected
                        ? 'border-[#00FFCC]/50 bg-[#00FFCC]/5 ring-1 ring-[#00FFCC]/20'
                        : count > 0
                          ? 'border-white/10 bg-[#1A1A1A] hover:border-white/20'
                          : 'border-white/5 bg-[#161616] hover:border-white/10'
                    )}
                  >
                    {/* Day number */}
                    <span className="mb-1.5">
                      {isToday ? (
                        <span className="flex items-center justify-center w-5 h-5 bg-[#00FFCC] text-black rounded-full text-[10px] font-black">
                          {day}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'text-xs font-black leading-none',
                            isSelected ? 'text-white' : 'text-white/50'
                          )}
                        >
                          {day}
                        </span>
                      )}
                    </span>

                    {/* Status dots for each gig */}
                    {count > 0 && (
                      <div className="flex flex-wrap gap-0.5 w-full">
                        {dayGigs.slice(0, 3).map((g) => (
                          <div
                            key={g.id}
                            className={cn('h-1 rounded-full flex-1', STATUS_CONFIG[g.status].dot)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Gig count */}
                    {count > 0 && (
                      <p
                        className={cn(
                          'text-[9px] font-black mt-1 leading-tight',
                          primaryStatus
                            ? STATUS_CONFIG[primaryStatus].dot.replace('bg-', 'text-')
                            : 'text-white/40'
                        )}
                      >
                        {count} gig{count > 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Multiple gig alert */}
                    {count >= 3 && (
                      <AlertTriangle className="absolute bottom-1.5 right-1.5 w-3 h-3 text-yellow-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-white/5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/30">
                Legend:
              </p>
              {Object.entries(STATUS_CONFIG).map(([, cfg]) => (
                <div key={cfg.label} className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
                  <span className="text-xs text-white/40">{cfg.label}</span>
                </div>
              ))}
            </div>

            {/* Undated drafts (legacy rows without a start time) */}
            {undated.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-2">
                  Undated gigs
                </p>
                <div className="flex flex-wrap gap-2">
                  {undated.map((gig) => (
                    <Link
                      key={gig.id}
                      href={`/gigs/${gig.id}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1A1A1A] border border-white/8 hover:border-white/20 transition-colors"
                    >
                      <div
                        className={cn('w-2 h-2 rounded-full', STATUS_CONFIG[gig.status].dot)}
                      />
                      <span className="text-xs text-white/60">{gig.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Day Detail Panel ──────────────────────── */}
          <div className="w-72 xl:w-80 flex-shrink-0 border-l border-white/5 bg-[#0D0D0D] flex-col overflow-y-auto hidden lg:flex">
            {/* Header */}
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-black text-white">Day Detail</h3>
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current" />
              </div>
              <p className="text-xs text-white/40">
                {selected !== null
                  ? `${MONTH_NAMES[month]} ${selected}, ${year}`
                  : 'Select a day to view gigs'}
              </p>
            </div>

            {selected !== null ? (
              <div className="flex-1 p-4 space-y-4">
                {isPending ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-[#00FFCC]/20 border-t-[#00FFCC] rounded-full animate-spin" />
                  </div>
                ) : selectedGigs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                      <PlusCircle className="w-5 h-5 text-white/20" />
                    </div>
                    <p className="text-sm font-bold text-white/30">No gigs posted</p>
                    <p className="text-xs text-white/20 mt-1 mb-4">
                      Nothing scheduled for this day
                    </p>
                    <Link href="/dashboard/venue/create-gig">
                      <Button
                        size="sm"
                        className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-xs"
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Post a Gig
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                      {selectedGigs.length} Gig{selectedGigs.length > 1 ? 's' : ''} Scheduled
                    </p>

                    <div className="space-y-3">
                      {selectedGigs.map((gig) => {
                        const st = STATUS_CONFIG[gig.status];
                        return (
                          <div
                            key={gig.id}
                            className={cn(
                              'rounded-xl border p-4 space-y-3',
                              gig.status === 'PUBLISHED'
                                ? 'bg-green-500/5 border-green-500/15'
                                : gig.status === 'FILLED'
                                  ? 'bg-[#00FFCC]/5 border-[#00FFCC]/15'
                                  : gig.status === 'COMPLETED'
                                    ? 'bg-blue-500/5 border-blue-500/15'
                                    : 'bg-[#1A1A1A] border-white/8'
                            )}
                          >
                            {/* Title row */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-black text-white leading-tight">
                                  {gig.title}
                                </p>
                                <p className="text-[11px] text-white/50 mt-0.5">
                                  {gig.role_needed}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  'text-[10px] font-black px-2 py-0.5 rounded-full border flex-shrink-0',
                                  st.color
                                )}
                              >
                                {st.label}
                              </span>
                            </div>

                            {/* Details */}
                            <div className="space-y-1.5 text-xs text-white/50">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-white/30 flex-shrink-0" />
                                <span>{formatTimeRange(gig.start_time, gig.end_time)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-3 h-3 text-white/30 flex-shrink-0" />
                                <span>{formatRate(gig.base_rate, gig.tips_included)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="w-3 h-3 text-white/30 flex-shrink-0" />
                                <span>
                                  {gig.applicant_count} applicant
                                  {gig.applicant_count !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {gig.status === 'FILLED' && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-[#00FFCC] flex-shrink-0" />
                                  <span className="text-[#00FFCC] font-bold">Talent hired</span>
                                </div>
                              )}
                            </div>

                            {/* Action */}
                            {gig.status !== 'COMPLETED' && gig.status !== 'CANCELLED' && (
                              <Link
                                href={
                                  gig.status === 'PUBLISHED' || gig.status === 'DRAFT'
                                    ? '/dashboard/venue/applicants'
                                    : `/gigs/${gig.id}`
                                }
                                className="w-full text-white/50 hover:text-white hover:bg-white/5 text-xs font-bold border border-white/8 rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {gig.status === 'PUBLISHED' || gig.status === 'DRAFT'
                                  ? 'Review Applicants'
                                  : 'View Details'}
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/5 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                        Day Summary
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Total Applicants</span>
                        <span className="font-bold text-white">
                          {selectedGigs.reduce((a, g) => a + g.applicant_count, 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Filled</span>
                        <span className="font-bold text-[#00FFCC]">
                          {selectedGigs.filter((g) => g.status === 'FILLED').length} /{' '}
                          {selectedGigs.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Still Hiring</span>
                        <span
                          className={cn(
                            'font-bold',
                            selectedGigs.some((g) => g.status === 'PUBLISHED')
                              ? 'text-yellow-400'
                              : 'text-white/30'
                          )}
                        >
                          {
                            selectedGigs.filter(
                              (g) => g.status === 'PUBLISHED' || g.status === 'DRAFT'
                            ).length
                          }{' '}
                          role
                          {selectedGigs.filter(
                            (g) => g.status === 'PUBLISHED' || g.status === 'DRAFT'
                          ).length !== 1
                            ? 's'
                            : ''}
                        </span>
                      </div>
                    </div>

                    <Link href="/dashboard/venue/create-gig">
                      <Button className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black flex items-center gap-2">
                        <PlusCircle className="w-4 h-4" /> Add Another Gig
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-sm font-bold text-white/30">Pick a day</p>
                <p className="text-xs text-white/20 mt-1">Click any date to view or manage gigs</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
