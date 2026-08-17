'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

/**
 * S13 — set a new password from an emailed reset link. better-auth's
 * /reset-password/:token callback validates the token first and redirects
 * here with ?token=… (or ?error=INVALID_TOKEN when expired/used). The token
 * is single-use and a successful reset revokes every existing session.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const linkError = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const invalidLink = Boolean(linkError) || !token;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError(resetError.message ?? 'This link is no longer valid — request a new one.');
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Wait a moment and try again.');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#121212] p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#00FFCC]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <p className="text-white/40 text-sm mt-2 tracking-wide">Choose a new password</p>
        </div>

        {done ? (
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-4 shadow-2xl text-center">
            <h1 className="text-white font-bold text-lg">Password updated</h1>
            <p className="text-white/50 text-sm leading-relaxed">
              Every previous session has been signed out. Sign in with your new password.
            </p>
            <Link
              href="/account/signin"
              className="w-full bg-[#00FFCC] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00FFCC]/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        ) : invalidLink ? (
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-4 shadow-2xl text-center">
            <h1 className="text-white font-bold text-lg">This link is no longer valid</h1>
            <p className="text-white/50 text-sm leading-relaxed">
              Reset links expire after 1 hour and work once. Request a fresh one and try again.
            </p>
            <Link
              href="/account/forgot-password"
              className="text-[#00FFCC] hover:underline text-sm font-semibold"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl"
          >
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                New Password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Confirm Password
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the new password"
                className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
              />
            </label>

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00FFCC] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00FFCC]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                'Updating…'
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Set New Password
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
