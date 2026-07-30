/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 better-auth client. Signup/signin pages and the mobile app all
 * import from here. Safe to leave as-is; unsafe to pass an explicit baseURL
 * (relative paths are correct — the pages + mobile WebView handle origin
 * routing via trustedOrigins on the server).
 */
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

// Additive twoFactor plugin (Backlog #17) — no baseURL is passed, per the
// contract above. When a sign-in answers with a 2FA challenge, forward to the
// challenge page, preserving the sanitized callbackUrl from the current
// sign-in URL so the post-verification redirect still lands where intended.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        const params = new URLSearchParams(window.location.search);
        const callbackUrl = params.get('callbackUrl');
        window.location.href =
          '/account/two-factor' +
          (callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : '');
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
