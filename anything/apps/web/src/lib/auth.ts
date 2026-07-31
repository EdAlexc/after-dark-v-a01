/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 better-auth configuration. The hooks.before middleware (backfills
 * `name` from email), bearer() plugin (mobile Authorization: Bearer flow),
 * trustedOrigins list, and socialProviders block are ALL load-bearing. A prior
 * AI removed the name backfill and broke every signup with [body.name]
 * validation errors. DO NOT simplify this config without understanding why each
 * piece is present.
 *
 *   Safe:   add user fields to `user.additionalFields`, tune session options.
 *   Unsafe: removing hooks.before, the bearer plugin, or trustedOrigins;
 *           changing cookie attributes (sameSite:'none' is required for
 *           mobile iframes); changing the database pool; hand-editing the
 *           socialProviders block (the platform injects the OAuth credentials
 *           via env vars when a provider is enabled in project settings).
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { argon2Verify } from 'argon2-wasm-edge';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { verifyPassword } from 'better-auth/crypto';
import { bearer, twoFactor } from 'better-auth/plugins';
import ws from 'ws';
import { vercelOrigins } from './deployment-origins';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Origins we accept auth requests from. Include every URL the app may be
// served under so better-auth's CSRF check doesn't reject legitimate requests
// as "Invalid origin". The request's own origin + known sandbox / published
// URLs + the mobile iframe proxy URL are all listed here.
//
// Vercel's per-deployment hostnames are appended at runtime: preview URLs are
// generated per deployment, so they cannot be pre-set in BETTER_AUTH_URL and
// every preview would otherwise reject sign-in. See ./deployment-origins.
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.EXPO_PUBLIC_PROXY_BASE_URL,
  process.env.NEXT_PUBLIC_CREATE_BASE_URL,
  process.env.NEXT_PUBLIC_CREATE_HOST
    ? `https://${process.env.NEXT_PUBLIC_CREATE_HOST}`
    : null,
  ...vercelOrigins(),
].filter((v): v is string => Boolean(v));

// Social providers self-activate when the platform has injected their OAuth
// credentials (set in project settings → Authentication, pushed in as env
// vars). A provider with missing credentials is simply not registered, so the
// corresponding sign-in button never reaches a half-configured backend.
const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
    ? {
        apple: {
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
          // Required to verify the identity token from native "Sign in with
          // Apple"; harmless when only web is used.
          ...(process.env.APPLE_APP_BUNDLE_IDENTIFIER
            ? {
                appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
              }
            : {}),
        },
      }
    : {}),
};

// S1 embed lockdown (Backlog #16): the create.xyz builder iframe is dead
// weight for the deployed product, so its accommodations are opt-in now.
// With the embed OFF (default), CSP frame-ancestors is 'self'
// (security-headers.js) — no iframe can carry the app — so SameSite=None
// serves no one and 'lax' closes the residual CSRF surface. Setting
// CREATE_BUILDER_EMBED=1 restores the exact pre-S1 cookie + CSP behavior the
// platform header describes (sameSite:'none' for iframes).
const builderEmbedEnabled = ['1', 'true'].includes(
  process.env.CREATE_BUILDER_EMBED ?? ''
);
const cookieSameSite = builderEmbedEnabled ? ('none' as const) : ('lax' as const);

async function verifyCompatiblePassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}) {
  if (hash.startsWith('$argon2')) {
    return argon2Verify({
      hash,
      password,
    });
  }

  return verifyPassword({
    hash,
    password,
  });
}

export const auth = betterAuth({
  database: pool,
  trustedOrigins,
  socialProviders,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      verify: verifyCompatiblePassword,
    },
  },
  hooks: {
    // better-auth's /sign-up/email schema requires `name`. Generated user apps
    // often collect only email+password, so backfill a name from the email
    // local-part to keep signup working without a visible name field.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;
      const body = ctx.body as { email?: unknown; name?: unknown } | undefined;
      if (!body || typeof body.email !== 'string') return;
      if (typeof body.name === 'string' && body.name.trim().length > 0) return;
      const derived = body.email.split('@')[0];
      body.name = derived && derived.length > 0 ? derived : 'User';
    }),
  },
  advanced: {
    cookiePrefix: 'better-auth',
    defaultCookieAttributes: {
      // 'none' only when the builder embed is opted in (see cookieSameSite).
      sameSite: cookieSameSite,
      secure: true,
      httpOnly: true,
      path: '/',
    },
    cookies: {
      sessionToken: {
        attributes: {
          sameSite: cookieSameSite,
          secure: true,
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
  // Additive hardening (safe per the header contract: config tuning only).
  // Throttles credential endpoints against brute force (OWASP A07). S1
  // (Backlog #21): storage moved from per-instance memory to the database
  // ("rateLimit" table, migration 0013) so the limits hold across serverless
  // fan-out.
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production',
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/change-password': { window: 900, max: 5 },
      '/two-factor/verify-totp': { window: 900, max: 10 },
      '/two-factor/verify-backup-code': { window: 900, max: 5 },
      '/two-factor/enable': { window: 900, max: 5 },
      '/two-factor/disable': { window: 900, max: 5 },
    },
  },
  user: {
    additionalFields: {
      image: {
        type: 'string',
        required: false,
      },
    },
  },
  // Enable Authorization: Bearer <session-token> so mobile apps (which can't
  // carry cookies through a WebView) authenticate API calls with the token
  // returned from /api/auth/token.
  //
  // twoFactor (additive plugin, Backlog #17): TOTP + one-time backup codes,
  // enforced AT SIGN-IN for enrolled users (challenge page:
  // /account/two-factor). Secrets are encrypted with the auth secret; the
  // plugin's account lockout (10 fails / 15 min) backs the rate limits above.
  plugins: [bearer(), twoFactor({ issuer: 'AfterDark' })],
});

export type Session = typeof auth.$Infer.Session;
