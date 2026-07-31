-- 0019_push_subscriptions.sql — S9 Web Push opt-in (Backlog #5).
--
-- One row per browser push subscription. The endpoint URL is the browser
-- vendor's opaque delivery address — treated as a credential (it lets the
-- holder send pushes to that device), hence RLS'd to the owner and only
-- ever read in bulk by SERVICE context (the hot-gig fan-out).
-- Push PAYLOADS are id-only by contract (api/utils/push.ts) — content is
-- fetched on notification open, so nothing personal transits FCM/APNs.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) <= 200),
  auth TEXT NOT NULL CHECK (char_length(auth) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_own ON push_subscriptions;
CREATE POLICY push_subscriptions_own ON push_subscriptions
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- The fan-out job reads across users; expired endpoints are pruned by it.
DROP POLICY IF EXISTS push_subscriptions_platform ON push_subscriptions;
CREATE POLICY push_subscriptions_platform ON push_subscriptions
  FOR ALL
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO afterdark_app;
    RAISE NOTICE 'GRANTed push_subscriptions access to afterdark_app';
  END IF;
END $$;
