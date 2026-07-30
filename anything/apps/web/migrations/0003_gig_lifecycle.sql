-- 0003_gig_lifecycle.sql — full gig status lifecycle (DEV_TIMELINE P1.3).
--
-- Widens the status CHECK from DRAFT|PUBLISHED to the PRD lifecycle:
-- DRAFT → PUBLISHED → FILLED → COMPLETED, with CANCELLED reachable from any
-- non-terminal state. Transition rules are enforced in the app
-- (src/app/api/utils/gig-lifecycle.ts); the constraint only pins the value set.

ALTER TABLE gigs DROP CONSTRAINT IF EXISTS gigs_status_check;
ALTER TABLE gigs ADD CONSTRAINT gigs_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'FILLED', 'COMPLETED', 'CANCELLED'));

-- Venue dashboard reads its own gigs newest-first across all statuses.
CREATE INDEX IF NOT EXISTS idx_gigs_venue_created ON gigs(venue_id, created_at DESC);
