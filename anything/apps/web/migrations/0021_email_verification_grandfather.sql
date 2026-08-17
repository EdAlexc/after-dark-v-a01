-- 0021_email_verification_grandfather.sql — S13 account-recovery spine.
--
-- S13 turns email verification ON for new signups (enforced only while the
-- email spine is keyed — see src/lib/auth.ts). Every account that already
-- exists signed up under the old regime (no verification email was ever
-- sent, and none COULD have been — no provider was configured), so enforcing
-- retroactively would lock real users out of accounts they legitimately
-- hold. Grandfather them: mark every pre-S13 account verified, exactly once,
-- at migration time. Documented trade-off: these addresses were attested at
-- signup, not proven; anything security-critical still has the password
-- (and 2FA where enrolled) in front of it.
--
-- Forward-only and idempotent by shape: after this runs, new rows default to
-- emailVerified = false again and must verify (when keys are set).

UPDATE "user"
SET "emailVerified" = true, "updatedAt" = NOW()
WHERE "emailVerified" = false;
