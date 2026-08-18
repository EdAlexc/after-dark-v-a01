'use client';

/**
 * Shared notifications bell (P3.4) — real unread count, dropdown of the
 * latest items, mark-all-read. Every dashboard header renders this instead
 * of the old decorative bell.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** Roles the bell can be mounted under (S17 — settings may pass `admin`;
 *  S19 widens this again for PARTY). */
export type BellRole = 'talent' | 'venue' | 'admin';

/** Human line + destination per notification kind. */
function describe(notification: Notification, role: BellRole): {
  text: string;
  href: string;
} {
  // Admin has no messages/applicants surfaces — every deep link falls back
  // to the moderation dashboard rather than a 404.
  if (role === 'admin') {
    const text = describe(notification, 'talent').text;
    return { text, href: '/dashboard/admin' };
  }
  const payload = notification.payload ?? {};
  const gigTitle = typeof payload.gigTitle === 'string' ? payload.gigTitle : 'a gig';
  switch (notification.kind) {
    case 'application.received':
      return { text: `New application for ${gigTitle}`, href: '/dashboard/venue/applicants' };
    case 'application.status': {
      const status = typeof payload.status === 'string' ? payload.status : 'updated';
      if (status === 'HIRED') {
        return { text: `You were hired for ${gigTitle} 🎉`, href: `/dashboard/${role}` };
      }
      if (status === 'RATE_ACCEPTED') {
        return { text: 'Your rate proposal was accepted', href: `/dashboard/${role}/messages` };
      }
      return {
        text: `Application for ${gigTitle}: ${status.toLowerCase()}`,
        href: `/dashboard/${role}/applicants`,
      };
    }
    case 'message.received':
      return { text: 'New message', href: `/dashboard/${role}/messages` };
    case 'shift.checked_in':
      return { text: `Checked in — ${gigTitle}`, href: `/dashboard/${role}` };
    case 'shift.checked_out':
      return { text: `Checked out — ${gigTitle}`, href: `/dashboard/${role}` };
    case 'payout.released': {
      const net = typeof payload.netCents === 'number' ? payload.netCents : null;
      return {
        text: net !== null ? `Payout released: $${(net / 100).toFixed(2)}` : 'Payout released',
        href: `/dashboard/${role}`,
      };
    }
    default:
      return { text: notification.kind, href: `/dashboard/${role}` };
  }
}

export function NotificationsBell({ role }: { role: BellRole }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json() as Promise<{ notifications: Notification[]; unreadCount: number }>;
    },
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors border border-white/5"
      >
        <Bell className="w-4 h-4 text-white/60" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[#00FFCC] text-black text-[9px] font-black rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="text-sm font-bold text-white">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-[11px] text-[#00FFCC] hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {(data?.notifications ?? []).length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-white/30">
                  Nothing yet — activity on your gigs and messages lands here.
                </p>
              ) : (
                (data?.notifications ?? []).map((notification) => {
                  const { text, href } = describe(notification, role);
                  return (
                    <Link
                      key={notification.id}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'block px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors',
                        notification.read_at === null && 'bg-[#00FFCC]/[0.04]'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {notification.read_at === null && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00FFCC] mt-1.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-white/80 leading-snug">{text}</p>
                          <p className="text-[10px] text-white/30 mt-0.5">
                            {new Date(notification.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
