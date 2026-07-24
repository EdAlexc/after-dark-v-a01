/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Renders the social sign-in buttons on the signin/signup pages. The set of
 * providers comes from NEXT_PUBLIC_CREATE_AUTH_PROVIDERS, which the platform
 * injects from the project's Authentication settings — so a provider only
 * appears here once it's enabled and configured. In the builder preview
 * (NEXT_PUBLIC_CREATE_ENV === 'DEVELOPMENT', inside an iframe) real OAuth can't
 * run, so clicks route to the dev shim; everywhere else they run the real
 * better-auth social flow.
 *
 *   Safe:   restyle the buttons, reorder providers.
 *   Unsafe: bypassing authClient.signIn.social, removing the dev-shim branch.
 */
'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

const KNOWN_PROVIDERS = ['google', 'apple'] as const;
type SocialProvider = (typeof KNOWN_PROVIDERS)[number];

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

// Google "G" SVG icon
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      fill="#EA4335"
    />
  </svg>
);

// Apple icon
const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 814 1000" fill="currentColor">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.5 0 261.1 0 190.2 0 85.4 68.1 32.9 133.5 32.9c76 0 120.5 51.9 165.5 51.9 42 0 93.4-54.7 170.6-54.7zm-169.5-62.1c32.5-39.8 55.5-95.7 55.5-151.6 0-7.7-.6-15.5-1.9-22.9-52.6 2-115.5 34.3-151.6 78.8-29.8 35.4-57.8 91.4-57.8 148 0 8.3 1.3 16.6 1.9 19.2 3.2.6 8.4 1.3 13.6 1.3 47.4 0 106.7-30.2 140.3-72.8z" />
  </svg>
);

const PROVIDER_ICONS: Record<SocialProvider, React.ReactNode> = {
  google: <GoogleIcon />,
  apple: <AppleIcon />,
};

const enabledProviders = (process.env.NEXT_PUBLIC_CREATE_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter((p): p is SocialProvider => KNOWN_PROVIDERS.includes(p as SocialProvider));

const isDevPreviewIframe = () => {
  if (process.env.NEXT_PUBLIC_CREATE_ENV !== 'DEVELOPMENT') return false;
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws — that means we're framed.
    return true;
  }
};

export function SocialSignInButtons({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  if (enabledProviders.length === 0) {
    return null;
  }

  const onClick = async (provider: SocialProvider) => {
    setError(null);
    setPending(provider);

    if (isDevPreviewIframe()) {
      const params = new URLSearchParams({ provider, callbackUrl });
      window.location.href = `/account/social-dev-shim?${params.toString()}`;
      return;
    }

    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL: callbackUrl,
    });
    if (socialError) {
      setError(socialError.message ?? `Could not sign in with ${PROVIDER_LABELS[provider]}`);
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/30 uppercase tracking-widest">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {enabledProviders.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={pending !== null}
          onClick={() => {
            void onClick(provider);
          }}
          className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50"
        >
          {PROVIDER_ICONS[provider]}
          {pending === provider ? 'Redirecting…' : `Continue with ${PROVIDER_LABELS[provider]}`}
        </button>
      ))}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
