'use client';

/**
 * Notifications history (S20 F5) — the full pageable feed behind the bell's
 * "View all". One page serves every role: the sidebar/deep-links need the
 * viewer's role, taken from ?role= (every entry point passes it) with the
 * session role as fallback. The param is read post-mount — useSearchParams
 * would demand a Suspense boundary that never resolves under the nonce-CSP
 * setup (the settings page learned this the hard way).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardSidebar from '@/components/DashboardSidebar';
import {
  NotificationsBell,
  describeNotification,
  type BellRole,
  type Notification,
} from '@/components/NotificationsBell';
import { useMyRole } from '@/lib/use-my-role';
import { cn } from '@/lib/utils';

const BELL_ROLES: readonly BellRole[] = ['talent', 'venue', 'admin', 'party'];

interface NotificationsPage {
  notifications: Notification[];
  unreadCount: number;
  page: number;
  hasMore: boolean;
}

export default function NotificationsHistoryPage() {
  const qc = useQueryClient();
  const { role: sessionRole } = useMyRole();

  const [paramRole, setParamRole] = useState<BellRole | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('role');
    if (wanted && (BELL_ROLES as readonly string[]).includes(wanted)) {
      setParamRole(wanted as BellRole);
    }
  }, []);
  const role: BellRole =
    paramRole ?? (sessionRole ? (sessionRole.toLowerCase() as BellRole) : 'talent');

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['notifications-history'],
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => {
        const res = await fetch(`/api/notifications?page=${pageParam}`);
        if (!res.ok) throw new Error('Failed to load notifications');
        return res.json() as Promise<NotificationsPage>;
      },
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    });

  const notifications = data?.pages.flatMap((page) => page.notifications) ?? [];
  const unread = data?.pages[0]?.unreadCount ?? 0;

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications-history'] });
    },
  });

  return (
    <div className="min-h-screen bg-[#121212] text-white flex font-sans pt-14 md:pt-0">
      <DashboardSidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-white/5 bg-[#121212]/80 backdrop-blur-md sticky top-14 md:top-0 z-20">
          <div>
            <h1 className="text-lg font-bold">Notifications</h1>
            <p className="text-xs text-white/40">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
                className="border-white/10 text-white/70 hover:text-white text-xs h-8"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" /> Mark all read
              </Button>
            )}
            <NotificationsBell role={role} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto">
            {isPending ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
              </div>
            ) : isError ? (
              <p className="text-center text-sm text-white/40 py-24">
                Could not load notifications — try refreshing.
              </p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Bell className="w-10 h-10 text-white/10 mb-3" />
                <p className="text-sm text-white/40 font-semibold">Nothing yet</p>
                <p className="text-xs text-white/20 mt-1">
                  Activity on your gigs and messages lands here.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/5 bg-[#1A1A1A] overflow-hidden">
                  {notifications.map((notification) => {
                    const { text, href } = describeNotification(notification, role);
                    return (
                      <Link
                        key={notification.id}
                        href={href}
                        className={cn(
                          'block px-4 py-3.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] transition-colors',
                          notification.read_at === null && 'bg-[#00FFCC]/[0.04]'
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {notification.read_at === null && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00FFCC] mt-1.5 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-white/80 leading-snug">{text}</p>
                            <p className="text-[11px] text-white/30 mt-0.5">
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
                  })}
                </div>
                {hasNextPage && (
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                      className="text-white/60"
                    >
                      {isFetchingNextPage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Load older notifications'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
