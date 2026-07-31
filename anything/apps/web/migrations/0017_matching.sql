-- 0017_matching.sql — S7 matching engine (Backlog #6).
--
-- One SECURITY DEFINER helper: "does this talent have an open AVAILABLE
-- slot on this date?" — a boolean, no data egress. Why a definer function
-- (same doctrine as 0014's app_user_has_application): availabilities are
-- the talent's PRIVATE calendar (0009 policy is talent-own), but two public
-- ranking surfaces legitimately need the yes/no bit:
--
--   1. the S5 browse boost (talent-query.ts ORDER BY), which would silently
--      stop boosting post-cutover if it probed the table directly;
--   2. the S7 match preview (candidate counts for the create-gig wizard),
--      where the count may use availability but slot details must not leak.
--
-- The function runs as the table owner, bypassing RLS inside the check
-- only; search_path pinned, STABLE, returns only a boolean.

CREATE OR REPLACE FUNCTION app_talent_available_on(p_talent_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM availabilities a
    WHERE a.talent_id = p_talent_id
      AND a.date = p_date
      AND a.status = 'AVAILABLE'
  );
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT EXECUTE ON FUNCTION app_talent_available_on(UUID, DATE) TO afterdark_app;
    RAISE NOTICE 'GRANTed availability-probe EXECUTE to afterdark_app';
  END IF;
END $$;

-- Pricing hints scan published-gig rates per role over a rolling window.
CREATE INDEX IF NOT EXISTS idx_gigs_role_created
  ON gigs (role_needed, created_at);
