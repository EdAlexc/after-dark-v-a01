-- 0001_baseline.sql — reproduces the schema the app already expects
-- (CLAUDE.md §6.1). Idempotent: safe on the existing create.xyz-provisioned
-- database AND creates everything on a fresh one.
--
-- better-auth managed tables use its default camelCase columns; app tables
-- use snake_case. Money-ish values stay NUMERIC until the P5 payments slice
-- introduces integer-cents ledger tables.

-- ─── better-auth core ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App-specific columns on the auth user (present in code since export).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "recovery_email" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "social_links" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "totp_enabled" BOOLEAN DEFAULT FALSE;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "totp_secret" TEXT; -- SecretBox-encrypted (v1.…)

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Marketplace profiles ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  stage_name TEXT,
  pronouns TEXT,
  neighborhood TEXT,
  bio TEXT,
  primary_role TEXT,
  genres_vibes JSONB DEFAULT '[]'::jsonb,
  hourly_rate_min NUMERIC,
  hourly_rate_max NUMERIC,
  social_links JSONB DEFAULT '{}'::jsonb,
  avatar_url TEXT,
  portfolio_images JSONB DEFAULT '[]'::jsonb,
  profile_completion_pct INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venue_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  venue_name TEXT,
  neighborhood TEXT,
  address TEXT,
  description TEXT,
  venue_type TEXT,
  capacity INTEGER,
  music_genres JSONB DEFAULT '[]'::jsonb,
  operating_hours JSONB DEFAULT '{}'::jsonb,
  avatar_url TEXT,
  gallery_images JSONB DEFAULT '[]'::jsonb,
  social_links JSONB DEFAULT '{}'::jsonb,
  rating NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Gigs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gigs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venue_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_needed TEXT,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  base_rate NUMERIC,
  tips_included BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Browse hot path (TENANT_GUARDRAIL §3 / CLAUDE.md §6.3).
CREATE INDEX IF NOT EXISTS idx_gigs_status_start ON gigs(status, start_time);
CREATE INDEX IF NOT EXISTS idx_gigs_venue ON gigs(venue_id);
