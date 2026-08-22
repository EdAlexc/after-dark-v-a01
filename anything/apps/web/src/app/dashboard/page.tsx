'use client';

/**
 * /dashboard root router (S19 — closes the F1 universal 404). Every surface
 * that can't know the caller's role ahead of time (post-2FA redirect, the
 * landing nav, notification fallbacks, bookmarks) sends people here; this
 * page reads the session role and forwards to the right home. Middleware
 * already gates the path on a session cookie.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dashboardPathFor, useMyRole } from '@/lib/use-my-role';

export default function DashboardRouterPage() {
  const router = useRouter();
  const { role, signedIn, isPending } = useMyRole();

  useEffect(() => {
    if (isPending) return;
    if (!signedIn) {
      // Middleware normally catches this; a stale cookie can still land here.
      router.replace('/account/signin?callbackUrl=%2Fdashboard');
      return;
    }
    router.replace(dashboardPathFor(role));
  }, [isPending, signedIn, role, router]);

  return (
    <main className="min-h-screen bg-[#121212] flex items-center justify-center">
      <div
        role="status"
        aria-label="Loading your dashboard"
        className="w-8 h-8 border-2 border-[#00FFCC]/20 border-t-[#00FFCC] rounded-full animate-spin"
      />
    </main>
  );
}
