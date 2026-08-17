'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { sanitizeCallbackUrl } from '@/lib/safe-redirect';
import { Zap } from 'lucide-react';
import Link from 'next/link';
import { SocialSignInButtons } from '@/components/SocialSignInButtons';

function SignInForm() {
  const searchParams = useSearchParams();
  // Open-redirect fix: only same-origin paths survive (CLAUDE.md §7.4).
  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        const msg =
          typeof signInError === 'string'
            ? signInError
            : (signInError.message ??
              (typeof signInError === 'object' ? JSON.stringify(signInError) : 'Sign in failed'));
        setError(msg);
        setLoading(false);
        return;
      }

      // 2FA-enrolled accounts get a challenge instead of a session; the
      // twoFactorClient plugin already navigated to /account/two-factor.
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        return;
      }

      if (typeof window !== 'undefined') {
        window.location.href = callbackUrl;
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#121212] p-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#00FFCC]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black tracking-tighter text-[#00FFCC]">
            AFTERDARK
          </Link>
          <p className="text-white/40 text-sm mt-2 tracking-wide">
            NYC's Premier Nightlife Marketplace
          </p>
        </div>

        <form
          onSubmit={(e) => {
            void onSubmit(e);
          }}
          className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl"
        >
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-white/40 text-sm mt-1">The night is still young. Sign back in.</p>
          </div>

          {/* Email */}
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
              className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
            />
          </label>

          {/* Password */}
          <label className="flex flex-col gap-2">
            <span className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Password
              </span>
              <Link
                href="/account/forgot-password"
                className="text-xs text-[#00FFCC] hover:underline font-semibold"
              >
                Forgot password?
              </Link>
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
              'Signing In…'
            ) : (
              <>
                <Zap className="w-4 h-4 fill-current" />
                Sign In
              </>
            )}
          </button>

          <SocialSignInButtons callbackUrl={callbackUrl} />

          <p className="text-center text-sm text-white/40">
            No account yet?{' '}
            <Link
              href={`/account/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="text-[#00FFCC] hover:underline font-semibold"
            >
              Join AfterDark
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
