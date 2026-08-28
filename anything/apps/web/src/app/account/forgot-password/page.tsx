'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

/**
 * S13 — request a password-reset link. The server answers uniformly whether
 * or not the account exists (no user enumeration), so this page shows ONE
 * outcome: "if that address has an account, mail is on the way." No branch
 * may reveal more.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: '/account/reset-password',
      });
      // Uniform by design — same message for known and unknown addresses.
      setSubmitted(true);
    } catch {
      // Only transport-level failures land here (e.g. rate limit / offline).
      setError('Something went wrong. Wait a moment and try again.');
    } finally {
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
          <p className="text-white/40 text-sm mt-2 tracking-wide">Reset your password</p>
        </div>

        {submitted ? (
          <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-4 shadow-2xl text-center">
            <h1 className="text-white font-bold text-lg">Check your email</h1>
            <p className="text-white/50 text-sm leading-relaxed">
              If <span className="text-white/80">{email}</span> has an AfterDark account, a
              reset link is on its way. It expires in 1 hour and works once.
            </p>
            <p className="text-white/40 text-sm">
              Nothing arriving? Check spam, or{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-[#00FFCC] hover:underline font-semibold"
              >
                try again
              </button>
              .
            </p>
            <Link href="/account/signin" className="text-[#00FFCC] hover:underline text-sm font-semibold">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl"
          >
            <p className="text-white/50 text-sm leading-relaxed">
              Enter your account email and we'll send a single-use reset link.
            </p>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/35 transition-all"
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
                'Sending…'
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Send Reset Link
                </>
              )}
            </button>

            <p className="text-center text-sm text-white/40">
              Remembered it?{' '}
              <Link href="/account/signin" className="text-[#00FFCC] hover:underline font-semibold">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
