'use client';

/**
 * Talent availability calendar (P6, wireframe p7) — real month grid over
 * /api/availability with the PRD's three slots per day, booked-shift overlay
 * (conflicts), a per-day slot editor, and the Available Tonight boost toggle.
 */

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import DashboardSidebar from '@/components/DashboardSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/pwa';

const SLOTS = [
  { key: 'EARLY_EVENING', label: 'Early Evening', hours: '6–10 PM' },
  { key: 'PRIME_TIME', label: 'Prime Time', hours: '10 PM–2 AM' },
  { key: 'AFTER_HOURS', label: 'After Hours', hours: '2–6 AM' },
] as const;
type SlotKey = (typeof SLOTS)[number]['key'];
type SlotStatus = 'AVAILABLE' | 'BLOCKED';

interface AvailabilityRow {
  date: string;
  time_slot: SlotKey;
  status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  notes: string | null;
}
interface ShiftRow {
  id: string;
  call_time: string | null;
  status: string;
  gig_title: string;
  venue_name: string | null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function dayKey(date: Date): string {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function TalentSchedulePage() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editorSlots, setEditorSlots] = useState<Partial<Record<SlotKey, SlotStatus>>>({});
  const [notes, setNotes] = useState('');

  const month = monthKey(cursor);

  const { data, isPending } = useQuery({
    queryKey: ['availability', month],
    queryFn: async () => {
      const res = await fetch(`/api/availability?month=${month}`);
      if (!res.ok) throw new Error('Failed to load availability');
      return res.json() as Promise<{ slots: AvailabilityRow[]; shifts: ShiftRow[] }>;
    },
  });

  const { data: profileData } = useQuery({
    queryKey: ['talent-profile'],
    queryFn: async () => {
      const res = await fetch('/api/talent/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json() as Promise<{ profile: { available_tonight?: boolean } | null }>;
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, AvailabilityRow[]>();
    for (const row of data?.slots ?? []) {
      // Neon returns DATE as YYYY-MM-DD; normalize defensively.
      const key = String(row.date).slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  }, [data]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const shift of data?.shifts ?? []) {
      if (!shift.call_time) continue;
      const key = dayKey(new Date(shift.call_time));
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [data]);

  const saveDay = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDay, slots: editorSlots, notes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save');
      }
    },
    onSuccess: () => {
      toast.success('Availability saved — synced with your profile');
      void qc.invalidateQueries({ queryKey: ['availability', month] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleTonight = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await fetch('/api/talent/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_tonight: value }),
      });
      if (!res.ok) throw new Error('Could not update');
      return value;
    },
    onSuccess: (value) => {
      toast.success(value ? 'Boost on — venues see you first tonight' : 'Boost off');
      void qc.invalidateQueries({ queryKey: ['talent-profile'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Hot-gig Web Push opt-in (S9). enabled:false = VAPID keys not set — the
  // toggle renders disabled instead of promising something that can't send.
  const { data: pushStatus } = useQuery({
    queryKey: ['push-status'],
    queryFn: async () => {
      const res = await fetch('/api/push/subscribe');
      if (!res.ok) throw new Error('Failed to load push status');
      return res.json() as Promise<{ enabled: boolean; subscribed: boolean }>;
    },
    staleTime: 60_000,
  });
  const pushToggle = useMutation({
    mutationFn: async (value: boolean) => {
      if (value) {
        const result = await subscribeToPush();
        if (result === 'denied') throw new Error('Notifications are blocked in your browser');
        if (result === 'unsupported') throw new Error('This browser does not support push');
        if (result === 'unavailable') throw new Error('Push alerts are not available right now');
        return true;
      }
      await unsubscribeFromPush();
      return false;
    },
    onSuccess: (subscribed) => {
      toast.success(subscribed ? 'Hot gig alerts on 🔥' : 'Hot gig alerts off');
      void qc.invalidateQueries({ queryKey: ['push-status'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEditor = (key: string) => {
    setSelectedDay(key);
    const existing = byDay.get(key) ?? [];
    const next: Partial<Record<SlotKey, SlotStatus>> = {};
    for (const row of existing) {
      if (row.status === 'AVAILABLE' || row.status === 'BLOCKED') {
        next[row.time_slot] = row.status;
      }
    }
    setEditorSlots(next);
    setNotes(existing.find((row) => row.notes)?.notes ?? '');
  };

  // Calendar grid math
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leadingBlanks = first.getDay();
  const todayKeyValue = dayKey(new Date());

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role="talent" />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Availability</h1>
            <p className="text-xs text-white/40">Changes sync instantly with your profile</p>
          </div>
          <NotificationsBell role="talent" />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-6xl">
            {/* ── Calendar ── */}
            <div className="xl:col-span-2 space-y-4">
              {/* Available tonight boost */}
              <Card className="bg-[#1E1E1E] border-[#00FFCC]/15">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#00FFCC] fill-current" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Available Tonight</p>
                      <p className="text-[11px] text-white/40">
                        Boosts you to the top of venue browse until you turn it off
                      </p>
                    </div>
                  </div>
                  <Switch
                    aria-label="Available Tonight boost"
                    checked={profileData?.profile?.available_tonight ?? false}
                    onCheckedChange={(value) => toggleTonight.mutate(value)}
                    className="data-[state=checked]:bg-[#00FFCC]"
                  />
                </CardContent>
              </Card>

              {/* Hot-gig push alerts (S9) — opt-in Web Push, key-gated server-side */}
              <Card className="bg-[#1E1E1E] border-white/5">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-white/60" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Hot Gig Alerts</p>
                      <p className="text-[11px] text-white/40">
                        Push notification when a gig starting tonight goes live
                      </p>
                    </div>
                  </div>
                  <Switch
                    aria-label="Hot gig push alerts"
                    checked={pushStatus?.subscribed ?? false}
                    disabled={pushStatus?.enabled === false || pushToggle.isPending}
                    onCheckedChange={(value) => pushToggle.mutate(value)}
                    className="data-[state=checked]:bg-[#00FFCC]"
                  />
                </CardContent>
              </Card>

              <Card className="bg-[#1E1E1E] border-white/5">
                <CardContent className="p-4">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-black">
                      {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                        }
                        aria-label="Previous month"
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
                      >
                        <ChevronLeft className="w-4 h-4 text-white/60" />
                      </button>
                      <button
                        onClick={() =>
                          setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                        }
                        aria-label="Next month"
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
                      >
                        <ChevronRight className="w-4 h-4 text-white/60" />
                      </button>
                    </div>
                  </div>

                  {isPending ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-white/45 mb-1">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                          <span key={i}>{d}</span>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: leadingBlanks }).map((_, i) => (
                          <div key={`blank-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const key = `${month}-${String(day).padStart(2, '0')}`;
                          const slots = byDay.get(key) ?? [];
                          const shifts = shiftsByDay.get(key) ?? [];
                          const hasAvailable = slots.some((s) => s.status === 'AVAILABLE');
                          const hasBlocked = slots.some((s) => s.status === 'BLOCKED');
                          const hasShift = shifts.length > 0;
                          // A shift on a BLOCKED day is a conflict worth flagging.
                          const conflict = hasShift && hasBlocked;
                          return (
                            <button
                              key={key}
                              onClick={() => openEditor(key)}
                              className={cn(
                                'aspect-square rounded-lg border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-colors',
                                selectedDay === key
                                  ? 'border-[#00FFCC] bg-[#00FFCC]/10 text-[#00FFCC]'
                                  : key === todayKeyValue
                                    ? 'border-white/20 bg-white/5 text-white'
                                    : 'border-white/5 text-white/60 hover:border-white/20',
                                conflict && 'border-orange-400/50'
                              )}
                            >
                              {day}
                              <span className="flex gap-0.5">
                                {hasShift && (
                                  <span
                                    className={cn(
                                      'w-1.5 h-1.5 rounded-full',
                                      conflict ? 'bg-orange-400' : 'bg-[#00FFCC]'
                                    )}
                                  />
                                )}
                                {hasAvailable && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                )}
                                {hasBlocked && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400/70" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-4 text-[10px] text-white/40">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-400" /> Available
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-400/70" /> Blocked
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#00FFCC]" /> Booked shift
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-400" /> Conflict
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Slot editor rail ── */}
            <div className="space-y-4">
              <Card className="bg-[#1E1E1E] border-white/5">
                <CardContent className="p-4">
                  {!selectedDay ? (
                    <div className="text-center py-10">
                      <CalendarDays className="w-8 h-8 text-white/10 mx-auto mb-2" />
                      <p className="text-xs text-white/45">Pick a day to edit its slots</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-black mb-3">
                        {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>

                      {(shiftsByDay.get(selectedDay) ?? []).map((shift) => (
                        <div
                          key={shift.id}
                          className="mb-3 rounded-lg bg-[#00FFCC]/5 border border-[#00FFCC]/20 px-3 py-2"
                        >
                          <p className="text-xs font-bold text-[#00FFCC]">
                            Booked: {shift.gig_title}
                          </p>
                          <p className="text-[11px] text-white/40">
                            {shift.venue_name} ·{' '}
                            {shift.call_time
                              ? new Date(shift.call_time).toLocaleTimeString(undefined, {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })
                              : ''}
                          </p>
                        </div>
                      ))}

                      <div className="space-y-2">
                        {SLOTS.map((slot) => {
                          const current = editorSlots[slot.key];
                          return (
                            <div
                              key={slot.key}
                              className="flex items-center justify-between rounded-xl bg-[#121212] border border-white/5 px-3 py-2.5"
                            >
                              <div>
                                <p className="text-xs font-bold text-white">{slot.label}</p>
                                <p className="text-[10px] text-white/35">{slot.hours}</p>
                              </div>
                              <div className="flex gap-1">
                                {(['AVAILABLE', 'BLOCKED'] as const).map((status) => (
                                  <button
                                    key={status}
                                    onClick={() =>
                                      setEditorSlots((prev) => ({
                                        ...prev,
                                        [slot.key]:
                                          prev[slot.key] === status ? undefined : status,
                                      }))
                                    }
                                    className={cn(
                                      'px-2 py-1 rounded-lg text-[10px] font-black border transition-colors',
                                      current === status
                                        ? status === 'AVAILABLE'
                                          ? 'bg-green-400/15 text-green-400 border-green-400/30'
                                          : 'bg-red-500/15 text-red-400 border-red-500/30'
                                        : 'bg-white/5 text-white/40 border-white/10 hover:text-white'
                                    )}
                                  >
                                    {status === 'AVAILABLE' ? 'Free' : 'Block'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <textarea
                        rows={2}
                        maxLength={500}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal notes (only you see these)"
                        className="w-full mt-3 bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#00FFCC]/50 resize-none"
                      />

                      <Button
                        disabled={saveDay.isPending}
                        onClick={() => saveDay.mutate()}
                        className="w-full mt-3 bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold text-sm"
                      >
                        {saveDay.isPending ? 'Saving…' : 'Save day'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
