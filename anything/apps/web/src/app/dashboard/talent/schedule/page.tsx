'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Download,
  Music,
  Save,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import DashboardSidebar from '@/components/DashboardSidebar';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
type TimeSlot = 'EARLY_EVENING' | 'PRIME_TIME' | 'AFTER_HOURS';

interface DayData {
  slots: Record<TimeSlot, SlotStatus>;
  bookedVenue?: string;
  notes?: string;
}

interface CalendarState {
  [dayKey: string]: DayData;
}

const SLOT_LABELS: Record<TimeSlot, { label: string; hours: string }> = {
  EARLY_EVENING: { label: 'Early Evening', hours: '6:00 PM – 10:00 PM' },
  PRIME_TIME: { label: 'Prime Time', hours: '10:00 PM – 2:00 AM' },
  AFTER_HOURS: { label: 'After Hours', hours: '2:00 AM – 6:00 AM' },
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

// Day-of-week for 1st of month (Zeller's algorithm, no Date())
function firstDayOfMonth(year: number, month: number): number {
  // month is 0-indexed
  const m = month === 0 ? 13 : month === 1 ? 14 : month + 1;
  const y = month < 2 ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h =
    (1 + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j) % 7;
  // h: 0=Sat,1=Sun,2=Mon,...,6=Fri -> convert to Sun=0
  return (h + 6) % 7;
}

// Days in month (no Date())
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

// ─── Initial calendar data ────────────────────────────────────────────────────

const INITIAL_DATA: CalendarState = {
  '2026-07-17': {
    slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'BOOKED', AFTER_HOURS: 'AVAILABLE' },
    bookedVenue: 'Nebula NYC',
    notes: 'Confirmed. Sound check at 9PM.',
  },
  '2026-07-18': {
    slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'BOOKED', AFTER_HOURS: 'AVAILABLE' },
    bookedVenue: 'The Standard',
    notes: '',
  },
  '2026-07-19': {
    slots: { EARLY_EVENING: 'BLOCKED', PRIME_TIME: 'BOOKED', AFTER_HOURS: 'BOOKED' },
    bookedVenue: 'Output BK',
    notes: 'Full night — both sets.',
  },
  '2026-07-22': {
    slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'AVAILABLE', AFTER_HOURS: 'BLOCKED' },
    notes: 'Unavailable after 2AM — personal.',
  },
  '2026-07-24': {
    slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'BOOKED', AFTER_HOURS: 'AVAILABLE' },
    bookedVenue: 'PHD Rooftop',
  },
  '2026-07-25': {
    slots: { EARLY_EVENING: 'BOOKED', PRIME_TIME: 'BOOKED', AFTER_HOURS: 'BLOCKED' },
    bookedVenue: 'Limelight',
    notes: 'Conflict — double check with venue.',
  },
  '2026-07-26': {
    slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'AVAILABLE', AFTER_HOURS: 'AVAILABLE' },
    notes: 'Open to gigs!',
  },
  '2026-07-31': {
    slots: { EARLY_EVENING: 'BLOCKED', PRIME_TIME: 'BLOCKED', AFTER_HOURS: 'BLOCKED' },
    notes: 'Vacation.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDayStatus(
  data: DayData | undefined
): 'BOOKED' | 'BLOCKED' | 'AVAILABLE' | 'CONFLICT' | null {
  if (!data) return null;
  const vals = Object.values(data.slots);
  const hasBooked = vals.includes('BOOKED');
  const hasBlocked = vals.includes('BLOCKED');
  const hasAvailable = vals.includes('AVAILABLE');
  if (hasBooked && hasBlocked) return 'CONFLICT';
  if (hasBooked) return 'BOOKED';
  if (hasBlocked && !hasAvailable) return 'BLOCKED';
  if (hasAvailable) return 'AVAILABLE';
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6); // 0-indexed: July
  const [selected, setSelected] = useState<number | null>(17);
  const [calData, setCalData] = useState<CalendarState>(INITIAL_DATA);
  const [availableTonight, setAvailableTonight] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fixed "today" to avoid hydration issues
  const TODAY = { year: 2026, month: 6, day: 17 };

  // ── Calendar grid cells (no new Date()) ──
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

  // ── Selected day editor state ──
  const selectedKey = selected !== null ? buildKey(year, month, selected) : null;
  const selectedData: DayData =
    selectedKey && calData[selectedKey]
      ? calData[selectedKey]
      : {
          slots: { EARLY_EVENING: 'AVAILABLE', PRIME_TIME: 'AVAILABLE', AFTER_HOURS: 'AVAILABLE' },
          notes: '',
        };

  const updateSlot = (slot: TimeSlot, status: SlotStatus) => {
    if (!selectedKey) return;
    setCalData((prev) => ({
      ...prev,
      [selectedKey]: {
        ...selectedData,
        slots: { ...selectedData.slots, [slot]: status },
      },
    }));
  };

  const updateNotes = (notes: string) => {
    if (!selectedKey) return;
    setCalData((prev) => ({
      ...prev,
      [selectedKey]: { ...selectedData, notes },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
  };

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

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Availability Calendar</h1>
            <p className="text-xs text-white/40">Manage your schedule and time slots</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#1E1E1E] border border-white/10 rounded-xl px-3 py-2">
              <span className="text-xs text-white/50 font-medium hidden sm:block">
                Available Tonight
              </span>
              <Switch
                checked={availableTonight}
                onCheckedChange={setAvailableTonight}
                className="data-[state=checked]:bg-[#00FFCC]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-white/50 hover:text-white text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Export</span>
            </Button>
            <button className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5">
              <Bell className="w-4 h-4 text-white/60" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#00FFCC] rounded-full" />
            </button>
          </div>
        </header>

        {/* Main layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── Calendar ───────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
            {/* Month navigation */}
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
                const key = buildKey(year, month, day);
                const data = calData[key];
                const status = getDayStatus(data);
                const isToday = year === TODAY.year && month === TODAY.month && day === TODAY.day;
                const isSelected = selected === day;

                return (
                  <button
                    key={key}
                    onClick={() => setSelected(day)}
                    className={cn(
                      'aspect-[1/1.15] rounded-xl p-2 flex flex-col items-start transition-all border text-left overflow-hidden relative',
                      isSelected
                        ? 'border-[#00FFCC]/50 bg-[#00FFCC]/5 ring-1 ring-[#00FFCC]/20'
                        : status === 'CONFLICT'
                          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
                          : 'border-white/5 bg-[#1A1A1A] hover:border-white/15'
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

                    {/* Slot bar indicators */}
                    {data && (
                      <div className="flex gap-0.5 w-full">
                        {(['EARLY_EVENING', 'PRIME_TIME', 'AFTER_HOURS'] as TimeSlot[]).map(
                          (slot) => {
                            const s = data.slots[slot];
                            return (
                              <div
                                key={slot}
                                className={cn(
                                  'h-1 flex-1 rounded-full',
                                  s === 'BOOKED'
                                    ? 'bg-[#00FFCC]'
                                    : s === 'BLOCKED'
                                      ? 'bg-white/25'
                                      : 'bg-white/8'
                                )}
                              />
                            );
                          }
                        )}
                      </div>
                    )}

                    {/* Booked venue name */}
                    {data?.bookedVenue && (
                      <div className="mt-1 w-full">
                        <div className="flex items-center gap-0.5">
                          <Music className="w-2.5 h-2.5 text-[#00FFCC] flex-shrink-0" />
                          <p className="text-[9px] font-bold text-[#00FFCC] truncate leading-tight">
                            {data.bookedVenue}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Conflict icon */}
                    {status === 'CONFLICT' && (
                      <AlertTriangle className="absolute bottom-1.5 right-1.5 w-3 h-3 text-red-400" />
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
              {[
                { color: 'bg-white/8 border border-white/15', label: 'Open' },
                { color: 'bg-[#00FFCC]', label: 'Booked' },
                { color: 'bg-white/25', label: 'Blocked' },
                { color: 'bg-red-500/60', label: 'Conflict' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn('w-3 h-3 rounded-sm', item.color)} />
                  <span className="text-xs text-white/40">{item.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-white/8 border border-white/15" />
                  <div className="w-2.5 h-2.5 rounded-sm bg-[#00FFCC]" />
                  <div className="w-2.5 h-2.5 rounded-sm bg-white/25" />
                </div>
                <span className="text-xs text-white/40">Slot bars: Early / Prime / After</span>
              </div>
            </div>
          </div>

          {/* ── Slot Editor ───────────────────────────── */}
          <div className="w-72 xl:w-80 flex-shrink-0 border-l border-white/5 bg-[#0D0D0D] flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-black text-white">Slot Editor</h3>
                <Zap className="w-3.5 h-3.5 text-[#00FFCC] fill-current" />
              </div>
              <p className="text-xs text-white/40">
                {selected !== null
                  ? `${MONTH_NAMES[month]} ${selected}, ${year}`
                  : 'Select a day to edit slots'}
              </p>
            </div>

            {selected !== null ? (
              <div className="flex-1 p-5 space-y-5">
                {/* Time Slots */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                    Time Slots
                  </p>
                  {(Object.keys(SLOT_LABELS) as TimeSlot[]).map((slot) => {
                    const { label, hours } = SLOT_LABELS[slot];
                    const status = selectedData.slots[slot];
                    const isBooked = status === 'BOOKED';

                    return (
                      <div
                        key={slot}
                        className={cn(
                          'rounded-xl border p-3.5 transition-colors',
                          isBooked
                            ? 'bg-[#00FFCC]/5 border-[#00FFCC]/20'
                            : status === 'BLOCKED'
                              ? 'bg-white/[0.03] border-white/8'
                              : 'bg-[#1A1A1A] border-white/8'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <div>
                            <p
                              className={cn(
                                'text-xs font-bold',
                                isBooked ? 'text-[#00FFCC]' : 'text-white/80'
                              )}
                            >
                              {label}
                            </p>
                            <p className="text-[10px] text-white/30">{hours}</p>
                          </div>
                          {isBooked && selectedData.bookedVenue && (
                            <div className="flex items-center gap-1">
                              <Music className="w-3 h-3 text-[#00FFCC]" />
                              <span className="text-[10px] font-bold text-[#00FFCC] truncate max-w-[80px]">
                                {selectedData.bookedVenue}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Status buttons */}
                        <div className="flex gap-1.5">
                          {(['AVAILABLE', 'BOOKED', 'BLOCKED'] as SlotStatus[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => updateSlot(slot, s)}
                              className={cn(
                                'flex-1 py-1 rounded-lg text-[10px] font-black transition-colors border',
                                status === s
                                  ? s === 'BOOKED'
                                    ? 'bg-[#00FFCC] text-black border-[#00FFCC]'
                                    : s === 'BLOCKED'
                                      ? 'bg-white/20 text-white border-white/30'
                                      : 'bg-white/10 text-white border-white/20'
                                  : 'bg-transparent text-white/30 border-white/10 hover:text-white/60'
                              )}
                            >
                              {s === 'AVAILABLE' ? 'Open' : s === 'BOOKED' ? 'Booked' : 'Block'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Notes */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                    Internal Notes
                  </p>
                  <textarea
                    rows={4}
                    placeholder="Add a note for this day…"
                    value={selectedData.notes ?? ''}
                    onChange={(e) => updateNotes(e.target.value)}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#00FFCC]/30 resize-none transition-colors"
                  />
                </div>

                {/* Day summary */}
                <div className="p-3 rounded-xl bg-[#1A1A1A] border border-white/5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
                    Day Summary
                  </p>
                  {(Object.keys(SLOT_LABELS) as TimeSlot[]).map((slot) => {
                    const s = selectedData.slots[slot];
                    return (
                      <div key={slot} className="flex items-center justify-between text-xs">
                        <span className="text-white/40">{SLOT_LABELS[slot].label}</span>
                        <span
                          className={cn(
                            'font-bold',
                            s === 'BOOKED'
                              ? 'text-[#00FFCC]'
                              : s === 'BLOCKED'
                                ? 'text-white/30'
                                : 'text-green-400'
                          )}
                        >
                          {s === 'BOOKED' ? '● Booked' : s === 'BLOCKED' ? '✕ Blocked' : '○ Open'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Save */}
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-sm font-bold text-white/30">Pick a day</p>
                <p className="text-xs text-white/20 mt-1">
                  Click any date to manage your availability slots
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
