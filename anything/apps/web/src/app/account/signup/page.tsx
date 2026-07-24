'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Music, Wine, Zap, Briefcase, User, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SocialSignInButtons } from '@/components/SocialSignInButtons';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = 'professional' | 'personal';
type Step = 'account-type' | 'signup';

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
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
        {children}
        <p className="text-center text-xs text-white/20 mt-6">
          By joining, you agree to our Terms of Service &amp; Privacy Policy.
        </p>
      </div>
    </main>
  );
}

// ─── Step 1: Account-type selector ───────────────────────────────────────────

function AccountTypeStep({
  onSelect,
  callbackUrl,
}: {
  onSelect: (type: AccountType) => void;
  callbackUrl: string;
}) {
  return (
    <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">I am looking for a…</h1>
        <p className="text-white/40 text-sm mt-1">Choose the account type that fits you</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Professional */}
        <button
          type="button"
          onClick={() => onSelect('professional')}
          className="group flex items-start gap-4 p-5 rounded-xl border border-white/10 bg-white/5 hover:border-[#00FFCC]/50 hover:bg-[#00FFCC]/5 transition-all text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-[#00FFCC]/10 border border-[#00FFCC]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#00FFCC]/20 transition-colors">
            <Briefcase className="w-5 h-5 text-[#00FFCC]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white group-hover:text-[#00FFCC] transition-colors">
              Professional Account
            </p>
            <p className="text-sm text-white/40 mt-1 leading-relaxed">
              For professionals looking to post and book gigs in NYC and its Boroughs.
            </p>
          </div>
          <div className="text-white/20 group-hover:text-[#00FFCC]/60 transition-colors mt-1 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>

        {/* Personal */}
        <button
          type="button"
          onClick={() => onSelect('personal')}
          className="group flex items-start gap-4 p-5 rounded-xl border border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/8 transition-all text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-white/15 transition-colors">
            <User className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white transition-colors">Personal Account</p>
            <p className="text-sm text-white/40 mt-1 leading-relaxed">
              For people exploring events in NYC.
            </p>
          </div>
          <div className="text-white/20 group-hover:text-white/40 transition-colors mt-1 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>
      </div>

      <p className="text-center text-sm text-white/40">
        Already have an account?{' '}
        <Link
          href={`/account/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-[#00FFCC] hover:underline font-semibold"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ─── Step 2: Signup form ──────────────────────────────────────────────────────

function SignUpForm({
  accountType,
  callbackUrl,
  onBack,
}: {
  accountType: AccountType;
  callbackUrl: string;
  onBack: () => void;
}) {
  const isProfessional = accountType === 'professional';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'TALENT' | 'VENUE'>('TALENT');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (typeof window !== 'undefined') {
      if (isProfessional) {
        localStorage.setItem('pendingRole', role);
      } else {
        localStorage.setItem('pendingRole', 'PERSONAL');
      }
    }

    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: '',
      });

      if (signUpError) {
        const msg =
          typeof signUpError === 'string'
            ? signUpError
            : (signUpError.message ??
              (typeof signUpError === 'object' ? JSON.stringify(signUpError) : 'Sign up failed'));
        setError(msg);
        setLoading(false);
        return;
      }

      if (typeof window !== 'undefined') {
        window.location.href = isProfessional ? '/onboarding' : '/';
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl"
    >
      {/* Back button + title */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="text-white/40 text-sm mt-1">
          {isProfessional
            ? 'Join thousands of NYC nightlife professionals'
            : 'Discover the best events happening in NYC'}
        </p>
      </div>

      {/* Role selector — professionals only */}
      {isProfessional && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            I am a…
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole('TALENT')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                role === 'TALENT'
                  ? 'border-[#00FFCC] bg-[#00FFCC]/10 text-[#00FFCC]'
                  : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
              }`}
            >
              <Music className="w-6 h-6" />
              <span className="text-sm font-bold">Talent</span>
              <span className="text-xs opacity-70">DJ, Bartender, Security…</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('VENUE')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                role === 'VENUE'
                  ? 'border-[#00FFCC] bg-[#00FFCC]/10 text-[#00FFCC]'
                  : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
              }`}
            >
              <Wine className="w-6 h-6" />
              <span className="text-sm font-bold">Venue</span>
              <span className="text-xs opacity-70">Club, Lounge, Bar…</span>
            </button>
          </div>
        </div>
      )}

      {/* Personal account badge */}
      {!isProfessional && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white/60" />
          </div>
          <div>
            <p className="text-xs font-bold text-white/70">Personal Account</p>
            <p className="text-[11px] text-white/35">Explore events and nightlife in NYC</p>
          </div>
        </div>
      )}

      {/* Email */}
      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Email</span>
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
        <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Password
        </span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
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
          'Creating Account…'
        ) : (
          <>
            <Zap className="w-4 h-4 fill-current" />
            Join AfterDark
          </>
        )}
      </button>

      <SocialSignInButtons callbackUrl={isProfessional ? '/onboarding' : '/'} />

      <p className="text-center text-sm text-white/40">
        Already have an account?{' '}
        <Link
          href={`/account/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-[#00FFCC] hover:underline font-semibold"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function SignUpFlow() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/onboarding';

  const [step, setStep] = useState<Step>('account-type');
  const [accountType, setAccountType] = useState<AccountType>('professional');

  const handleSelectType = (type: AccountType) => {
    setAccountType(type);
    setStep('signup');
  };

  return (
    <PageShell>
      {step === 'account-type' ? (
        <AccountTypeStep onSelect={handleSelectType} callbackUrl={callbackUrl} />
      ) : (
        <SignUpForm
          accountType={accountType}
          callbackUrl={callbackUrl}
          onBack={() => setStep('account-type')}
        />
      )}
    </PageShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpFlow />
    </Suspense>
  );
}
