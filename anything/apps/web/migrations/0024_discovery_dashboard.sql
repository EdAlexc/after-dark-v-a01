-- 0024_discovery_dashboard.sql — S20 discovery & dashboard completion.
--
-- 1) saved_talent — F4: a venue user's private talent bookmarks, previously
--    ephemeral client state (plain useState — lost on refresh and filtered
--    against the current browse page only). Keyed by the venue USER id
--    (bookmarks are personal, and a venue user without a completed
--    venue_profiles row may still browse) and by the public
--    talent_profiles.id — the only talent identifier the client ever sees
--    (same choice reviews.talent_id makes in 0018). The composite PK makes
--    "one bookmark per pair" a DB fact; there is no UPDATE surface at all.
--
-- 2) app_venue_response_stats — D3 decided: DEFINE the wireframe-p4 venue
--    "response rate" rather than drop it. Definition: over conversations
--    opened in the last 90 days, the share of INBOUND threads (ones where
--    the counterpart sent the first non-SYSTEM message) that the venue
--    answered with a non-SYSTEM message of its own afterwards. Same
--    SECURITY DEFINER doctrine as 0017's availability probe: conversations
--    and messages are participant-private (0008 policies), but the public
--    venue cards legitimately need the aggregate — the function returns two
--    counts, nothing row-level, and keeps working after the RLS cutover
--    (a bare aggregate would silently read zero rows as the non-owner role).

CREATE TABLE IF NOT EXISTS saved_talent (
  venue_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES talent_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_user_id, talent_id)
);

-- The saved rail lists newest-first per venue user.
CREATE INDEX IF NOT EXISTS idx_saved_talent_venue_created
  ON saved_talent (venue_user_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Bookmarks are strictly the venue user's own: no public read, no
-- cross-tenant surface, and no platform carve-out (nothing admin-facing
-- reads them; erasure rides the "user" FK cascade; the export runs under
-- the subject's own context and this owner policy).

ALTER TABLE saved_talent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_talent_owner_all ON saved_talent;
CREATE POLICY saved_talent_owner_all ON saved_talent
  FOR ALL
  USING (venue_user_id = current_setting('app.user_id', true))
  WITH CHECK (venue_user_id = current_setting('app.user_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, DELETE ON saved_talent TO afterdark_app;
    REVOKE UPDATE ON saved_talent FROM afterdark_app;
    RAISE NOTICE 'GRANTed saved_talent access to afterdark_app';
  END IF;
END $$;

-- ─── D3: venue response stats ────────────────────────────────────────────────
-- Returns (inbound_count, responded_count) for the venue's last 90 days.
-- The caller derives the percentage and hides it below a 3-conversation
-- floor (a small sample reading as reputation would mislead). SYSTEM
-- messages are ignored on both sides — thread-creation banners are not
-- correspondence. Unknown venue id → (0, 0).

CREATE OR REPLACE FUNCTION app_venue_response_stats(p_venue_id UUID)
RETURNS TABLE (inbound_count INTEGER, responded_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH venue_owner AS (
    SELECT user_id FROM venue_profiles WHERE id = p_venue_id
  ),
  inbound AS (
    SELECT c.id,
           MIN(m.created_at) FILTER (WHERE m.sender_id <> vo.user_id) AS first_inbound_at
    FROM conversations c
    JOIN venue_owner vo ON c.venue_user_id = vo.user_id
    JOIN messages m ON m.conversation_id = c.id AND m.kind <> 'SYSTEM'
    WHERE c.created_at > NOW() - INTERVAL '90 days'
    GROUP BY c.id, vo.user_id
    HAVING MIN(m.created_at) FILTER (WHERE m.sender_id <> vo.user_id) IS NOT NULL
  ),
  judged AS (
    SELECT inbound.id,
           EXISTS (
             SELECT 1
             FROM messages r, venue_owner vo
             WHERE r.conversation_id = inbound.id
               AND r.sender_id = vo.user_id
               AND r.kind <> 'SYSTEM'
               AND r.created_at > inbound.first_inbound_at
           ) AS responded
    FROM inbound
  )
  SELECT COUNT(*)::int AS inbound_count,
         COUNT(*) FILTER (WHERE judged.responded)::int AS responded_count
  FROM judged;
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT EXECUTE ON FUNCTION app_venue_response_stats(UUID) TO afterdark_app;
    RAISE NOTICE 'GRANTed response-stats EXECUTE to afterdark_app';
  END IF;
END $$;
