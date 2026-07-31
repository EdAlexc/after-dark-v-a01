'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, Download, LogOut, Mail } from 'lucide-react';

/**
 * Minimal "account suspended" surface (S4). Suspension is enforced
 * server-side in AuthGuard — this page only explains the 403s a suspended
 * user would otherwise hit as broken dashboards, and keeps the GDPR
 * self-service rights reachable (export works while suspended by design).
 */
export default function SuspendedPage() {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'suspended'; reason: string | null }
    | { kind: 'not-suspended' }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/session');
        if (cancelled) return;
        if (res.status === 403) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          const message = body?.error ?? '';
          const reason = message.startsWith('Account suspended: ')
            ? message.slice('Account suspended: '.length)
            : null;
          setState({ kind: 'suspended', reason });
          return;
        }
        // Signed out or in good standing — this page has nothing to say.
        setState({ kind: 'not-suspended' });
        window.location.href = res.status === 401 ? '/account/signin' : '/';
      } catch {
        if (!cancelled) setState({ kind: 'suspended', reason: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#121212] p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        <span className="text-3xl font-black tracking-tighter text-[#00FFCC]">AFTERDARK</span>

        {state.kind === 'loading' ? (
          <div className="w-8 h-8 border-2 border-[#00FFCC]/20 border-t-[#00FFCC] rounded-full animate-spin" />
        ) : state.kind === 'suspended' ? (
          <div className="w-full rounded-2xl bg-[#1E1E1E] border border-white/10 p-6 space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-base font-black text-white">Account suspended</h1>
                <p className="text-xs text-white/40">
                  Your account has been suspended by a moderator.
                </p>
              </div>
            </div>

            {state.reason && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1">
                  Reason
                </p>
                <p className="text-sm text-white/70">{state.reason}</p>
              </div>
            )}

            <p className="text-xs text-white/50 leading-relaxed">
              While suspended you can&apos;t browse, apply, post, or message. You can still
              export your data or request account deletion — those rights survive moderation.
              If you believe this is a mistake, contact support.
            </p>

            <div className="space-y-2">
              <Link
                href="/contact"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 text-sm font-bold text-[#00FFCC] hover:bg-[#00FFCC]/15 transition-colors"
              >
                <Mail className="w-4 h-4" /> Contact support
              </Link>
              <a
                href="/api/account/export"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 hover:bg-white/10 transition-colors"
              >
                <Download className="w-4 h-4" /> Export my data
              </a>
              <Link
                href="/account/logout"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </Link>
            </div>
          </div>
        ) : (
          <span className="text-white/40 text-sm">Redirecting…</span>
        )}
      </div>
    </main>
  );
}
