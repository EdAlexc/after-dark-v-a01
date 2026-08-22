'use client';

/**
 * Session role for client surfaces whose UI depends on who is looking
 * (S19). The role is NOT in the better-auth session payload — it lives on
 * the user row — so the surfaces that need it (dashboard root router, venue
 * detail CTA, search-page CTAs) share this one cached query instead of each
 * re-rolling the fetch.
 */

import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';

export type MarketplaceRole = 'TALENT' | 'VENUE' | 'PARTY' | 'ADMIN';

/** Dashboard path segment per role — single source for role-aware redirects. */
export function dashboardPathFor(role: MarketplaceRole | null): string {
  if (role === 'ADMIN') return '/dashboard/admin';
  if (role === 'VENUE') return '/dashboard/venue';
  if (role === 'TALENT') return '/dashboard/talent';
  // PARTY has no principal dashboard — their home is venue discovery (§6.3).
  if (role === 'PARTY') return '/venues';
  // No role yet: onboarding assigns one.
  return '/onboarding';
}

export function useMyRole(): {
  role: MarketplaceRole | null;
  signedIn: boolean;
  isPending: boolean;
  /** Fetch failed — `role: null` then means "unknown", NOT "no role yet". */
  isError: boolean;
} {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  const { data, isPending: rolePending, isError } = useQuery({
    queryKey: ['my-role'],
    enabled: signedIn,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch('/api/user/role');
      if (!res.ok) throw new Error('Failed to load role');
      return res.json() as Promise<{ user: { role: MarketplaceRole | null } | null }>;
    },
  });

  return {
    role: data?.user?.role ?? null,
    signedIn,
    isPending: sessionPending || (signedIn && rolePending),
    isError: signedIn && isError,
  };
}
