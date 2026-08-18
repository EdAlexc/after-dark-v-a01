'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { sanitizeCallbackUrl } from '@/lib/safe-redirect';
import { purgeSwCaches } from '@/lib/pwa';

function LogoutHandler() {
  const searchParams = useSearchParams();
  // A01 open-redirect guard: logout must not forward to attacker URLs any
  // more than signin/signup do (this page was the one unsanitized holdout).
  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // §6.6: purge service-worker caches on logout, before the session ends,
      // so nothing cached survives into the next user's session on this device.
      await purgeSwCaches();
      const { error: signOutError } = await authClient.signOut();
      if (cancelled) return;
      if (signOutError) {
        setError(signOutError.message ?? 'Sign out failed');
        return;
      }
      if (typeof window !== 'undefined') {
        window.location.href = callbackUrl;
      } else {
        console.warn('logout: window is undefined; cannot redirect to callbackUrl');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callbackUrl]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#121212] p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-3xl font-black tracking-tighter text-[#00FFCC]">AFTERDARK</span>
        {error ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-[#00FFCC]/20 border-t-[#00FFCC] rounded-full animate-spin" />
            <span className="text-white/40 text-sm">Signing you out…</span>
          </>
        )}
      </div>
    </main>
  );
}

export default function LogoutPage() {
  return (
    <Suspense>
      <LogoutHandler />
    </Suspense>
  );
}
