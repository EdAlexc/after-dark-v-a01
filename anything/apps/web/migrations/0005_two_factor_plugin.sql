-- 0005_two_factor_plugin.sql — better-auth twoFactor plugin (Backlog #17).
--
-- Replaces the hand-rolled TOTP with the plugin's model: sign-in is now
-- actually gated for enrolled users (the old system was a settings toggle
-- that never challenged at sign-in), and users get one-time backup codes.
-- Secrets/backup codes are stored symmetric-encrypted with the auth secret
-- (BETTER_AUTH_SECRET) by the plugin — ⚠ rotating that secret invalidates
-- every enrollment.
--
-- Column names are camelCase because better-auth manages these tables.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id" TEXT PRIMARY KEY,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verified" BOOLEAN DEFAULT TRUE,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_twoFactor_userId" ON "twoFactor"("userId");
CREATE INDEX IF NOT EXISTS "idx_twoFactor_secret" ON "twoFactor"("secret");

-- Legacy hand-rolled columns: clean break. The old 2FA never gated sign-in,
-- so clearing it locks nobody out — previously "enrolled" users simply
-- re-enroll through the plugin flow (Settings → Two-Factor Authentication).
-- Columns stay (cheap, avoids breaking older code paths during rollout).
UPDATE "user" SET totp_enabled = FALSE, totp_secret = NULL
  WHERE totp_enabled = TRUE OR totp_secret IS NOT NULL;
