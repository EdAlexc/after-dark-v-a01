'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
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
import { Button } from '@/components/ui/button';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type GigStatus = 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'COMPLETED' | 'CANCELLED';

interface GigEvent {
  id: number;
  title: string;
  role: string;
  time: string;
  rate: string;
  applicants: number;
  hired?: string;
  status: GigStatus;
}

interface DayGigs {
  gigs: GigEvent[];
}

interface GigCalendar {
  [dayKey: string]: DayGigs;
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

function firstDayOfMonth(year: number, month: number): number {
  const m = month === 0 ? 13 : month === 1 ? 14 : month + 1;
  const y = month < 2 ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h =
    (1 + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j) % 7;
  return (h + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 1) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return days[month];
}

function buildKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Mock gig calendar ────────────────────────────────────────────────────────

const INITIAL_GIGS: GigCalendar = {
  '2026-07-17': {
    gigs: [
      {
        id: 1,
        title: 'Rooftop Happy Hour DJ',
        role: 'DJ',
        time: '5PM–9PM',
        rate: '$100/hr',
        applicants: 3,
        status: 'DRAFT',
      },
    ],
  },
  '2026-07-18': {
    gigs: [
      {
        id: 2,
        title: 'House Night Opener',
        role: 'DJ / Producer',
        time: '10PM–1AM',
        rate: '$120/hr',
        applicants: 8,
        hired: 'Marcus Lee',
        status: 'FILLED',
      },
      {
        id: 3,
        title: 'VIP Lounge Mixologist',
        role: 'Mixologist',
        time: '8PM–2AM',
        rate: '$65/hr + Tips',
        applicants: 6,
        hired: 'Sophia Cruz',
        status: 'FILLED',
      },
    ],
  },
  '2026-07-19': {
    gigs: [
      {
        id: 4,
        title: 'Closing Set – Main Room',
        role: 'DJ / Producer',
        time: '2AM–6AM',
        rate: '$180/hr',
        applicants: 14,
        status: 'PUBLISHED',
      },
      {
        id: 5,
        title: 'Door / Security Lead',
        role: 'Security',
        time: '9PM–4AM',
        rate: '$45/hr',
        applicants: 22,
        hired: 'James Rivera',
        status: 'FILLED',
      },
      {
        id: 6,
        title: 'Event Host / MC',
        role: 'Host / MC',
        time: '9PM–3AM',
        rate: '$90/hr',
        applicants: 9,
        status: 'PUBLISHED',
      },
    ],
  },
  '2026-07-24': {
    gigs: [
      {
        id: 7,
        title: 'Friday Deep House Night',
        role: 'DJ',
        time: '10PM–3AM',
        rate: '$150/hr',
        applicants: 5,
        status: 'PUBLISHED',
      },
    ],
  },
  '2026-07-25': {
    gigs: [
      {
        id: 8,
        title: 'Saturday Techno Closing',
        role: 'DJ / Producer',
        time: '2AM–6AM',
        rate: '$200/hr',
        applicants: 11,
        status: 'PUBLISHED',
      },
      {
        id: 9,
        title: 'Weekend Bartender',
        role: 'Bartender',
        time: '7PM–3AM',
        rate: '$55/hr + Tips',
        applicants: 4,
        status: 'DRAFT',
      },
    ],
  },
  '2026-07-10': {
    gigs: [
      {
        id: 10,
        title: 'Afrobeats Friday',
        role: 'DJ',
        time: '9PM–2AM',
        rate: '$130/hr',
        applicants: 7,
        hired: 'DJ Kira Voss',
        status: 'COMPLETED',
      },
    ],
  },
  '2026-07-11': {
    gigs: [
      {
        id: 11,
        title: 'Latin Night',
        role: 'DJ / Producer',
        time: '10PM–4AM',
        rate: '$140/hr',
        applicants: 9,
        hired: 'DJ Salsa',
        status: 'COMPLETED',
      },
    ],
  },
  '2026-07-31': {
    gigs: [
      {
        id: 12,
        title: 'Summer Closing Party',
        role: 'Multiple Roles',
        time: '9PM–6AM',
        rate: 'Varies',
        applicants: 0,
        status: 'DRAFT',
      },
    ],
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueSchedulePage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6); // July 0-indexed
  const [selected, setSelected] = useState<number | null>(19);

  const TODAY = { year: 2026, month: 6, day: 17 };

  const cells = useMemo<(number | null)[]>(() => {
    const firstDay = firstDayOfMonth(year, month);
    const totalDays = daysInMonth(year, month);
    const result: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  const selectedKey = selected !== null ? buildKey(year, month, selected) : null;
  const selectedGigs = selectedKey ? (INITIAL_GIGS[selectedKey]?.gigs ?? []) : [];

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

  const gigCountForDay = (day: number) => {
    const key = buildKey(year, month, day);
    return INITIAL_GIGS[key]?.gigs.length ?? 0;
  };

  const primaryStatusForDay = (day: number): GigStatus | null => {
    const key = buildKey(year, month, day);
    const gigs = INITIAL_GIGS[key]?.gigs;
    if (!gigs || gigs.length === 0) return null;
    const priority: GigStatus[] = ['PUBLISHED', 'FILLED', 'DRAFT', 'COMPLETED', 'CANCELLED'];
    for (const p of priority) {
      if (gigs.some((g) => g.status === p)) return p;
    }
    return gigs[0].status;
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="venue" userName="Nebula NYC" />

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
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
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
                  className="w-8 h-8 rounded-lg bg-[#1E1E1E] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-white/60" />
                </button>
                <h2 className="text-lg font-black">
                  {MONTH_NAMES[month]} {year}
                </h2>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 rounded-lg bg-[#1E1E1E] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <button
                onClick={() => {
                  setYear(TODAY.year);
                  setMonth(TODAY.month);
                  setSelected(TODAY.day);
                }}
                className="text-xs font-bold text-[#00FFCC] hover:underline"
              >
                Today
              </button>
            </div>

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
                const count = gigCountForDay(day);
                const primaryStatus = primaryStatusForDay(day);
                const isToday = year === TODAY.year && month === TODAY.month && day === TODAY.day;
                const isSelected = selected === day;
                const key = buildKey(year, month, day);
                const dayGigs = INITIAL_GIGS[key]?.gigs ?? [];

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
                    {dayGigs.length > 0 && (
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
          </div>

          {/* ── Day Detail Panel ──────────────────────── */}
          <div className="w-72 xl:w-80 flex-shrink-0 border-l border-white/5 bg-[#0D0D0D] flex flex-col overflow-y-auto">
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
                {selectedGigs.length === 0 ? (
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
                                <p className="text-[11px] text-white/50 mt-0.5">{gig.role}</p>
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
                                <span>{gig.time}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-3 h-3 text-white/30 flex-shrink-0" />
                                <span>{gig.rate}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="w-3 h-3 text-white/30 flex-shrink-0" />
                                <span>
                                  {gig.applicants} applicant{gig.applicants !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {gig.hired && (
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-3 h-3 text-[#00FFCC] flex-shrink-0" />
                                  <span className="text-[#00FFCC] font-bold">{gig.hired}</span>
                                </div>
                              )}
                            </div>

                            {/* Action */}
                            {gig.status !== 'COMPLETED' && gig.status !== 'CANCELLED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full text-white/50 hover:text-white hover:bg-white/5 text-xs font-bold border border-white/8 flex items-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {gig.status === 'PUBLISHED' || gig.status === 'DRAFT'
                                  ? 'Review Applicants'
                                  : 'View Details'}
                              </Button>
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
                          {selectedGigs.reduce((a, g) => a + g.applicants, 0)}
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
