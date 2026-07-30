'use client';

/**
 * Second-factor challenge (Backlog #17). Users land here from sign-in when
 * their account has 2FA enabled (better-auth sets a short-lived two-factor
 * cookie — the challenge expires after ~10 minutes and the user must sign
 * in again). Verifies a TOTP code or a one-time backup code.
 */

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { sanitizeCallbackUrl } from '@/lib/safe-redirect';

function TwoFactorForm() {
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: verifyError } =
      mode === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice });

    if (verifyError) {
      const message = verifyError.message ?? 'Verification failed';
      // An expired/missing challenge cookie can only be fixed by signing in again.
      setError(
        /cookie|expired|unauthorized/i.test(message)
          ? 'This sign-in challenge has expired — please sign in again.'
          : message
      );
      setLoading(false);
      return;
    }

    window.location.href = callbackUrl === '/' ? '/dashboard/talent' : callbackUrl;
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
          <p className="text-white/40 text-sm mt-2 tracking-wide">Two-factor verification</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FFCC]/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#00FFCC]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">One more step</h1>
              <p className="text-white/40 text-sm mt-1">
                {mode === 'totp'
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Enter one of your one-time backup codes.'}
              </p>
            </div>
          </div>

          <input
            type="text"
            inputMode={mode === 'totp' ? 'numeric' : 'text'}
            autoFocus
            required
            maxLength={mode === 'totp' ? 6 : 32}
            value={code}
            onChange={(e) =>
              setCode(mode === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value)
            }
            placeholder={mode === 'totp' ? '000000' : 'backup-code'}
            className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white text-center text-xl tracking-[0.4em] font-mono outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/20 transition-all"
          />

          <label className="flex items-center gap-2.5 text-sm text-white/50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="w-4 h-4 rounded accent-[#00FFCC]"
            />
            Trust this device for 30 days
          </label>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}{' '}
              {/expired/.test(error) && (
                <Link href="/account/signin" className="underline font-semibold">
                  Back to sign-in
                </Link>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.trim().length < (mode === 'totp' ? 6 : 8)}
            className="w-full bg-[#00FFCC] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00FFCC]/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode((prev) => (prev === 'totp' ? 'backup' : 'totp'));
              setCode('');
              setError(null);
            }}
            className="flex items-center justify-center gap-2 text-sm text-white/40 hover:text-[#00FFCC] transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            {mode === 'totp' ? 'Use a backup code instead' : 'Use my authenticator app'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}
