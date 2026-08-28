-- 0025_event_listings.sql — public event listings, separate from gigs.
--
-- Until now the crawled NYC dataset flattened every happening into gigs
-- (work listings). Party people — and any signed-out visitor — browse the
-- *event* (the night itself: who plays, where, when), while talent browse
-- the *gig* (the role the venue is hiring for that night). This migration
-- gives the happening its own row and lets a gig point at the listing it
-- staffs, so "Browse Gigs & Events" can serve both audiences from real data.
--
-- Named `event_listings` because `events` is taken: 0016's S6 capture stream
-- (venue KPI trends) already owns that table name.
--
-- Listings are public content (same doctrine as PUBLISHED gigs / venue
-- profiles): public read while PUBLISHED, owner-venue writes, platform
-- carve-out for ADMIN/SERVICE. Rows are written by the venue (future
-- surface) or the seed importer today — never by anonymous input.

CREATE TABLE IF NOT EXISTS event_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venue_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  age_requirement INTEGER NOT NULL DEFAULT 21,
  -- Where the public listing was found (provenance for the crawled dataset,
  -- e.g. 'ra.co + dice.fm'); free text, display-only.
  source_platform TEXT,
  status TEXT NOT NULL DEFAULT 'PUBLISHED'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One row per happening; also the importer's idempotency key.
  UNIQUE (venue_id, title, start_time)
);

-- Browse hot path: upcoming PUBLISHED listings soonest-first.
CREATE INDEX IF NOT EXISTS idx_event_listings_status_start
  ON event_listings (status, start_time);

-- A gig can staff a specific listing; deleting the listing keeps the gig
-- (the work listing stands on its own — same reason gigs carry their own
-- denormalized address).
ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS event_listing_id UUID
    REFERENCES event_listings(id) ON DELETE SET NULL;

-- "N open roles" per event card.
CREATE INDEX IF NOT EXISTS idx_gigs_event_listing
  ON gigs (event_listing_id)
  WHERE event_listing_id IS NOT NULL;

-- ─── RLS (mirrors gigs: 0004 base + 0014 platform carve-out) ─────────────────

ALTER TABLE event_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_listings_public_read ON event_listings;
CREATE POLICY event_listings_public_read ON event_listings
  FOR SELECT USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS event_listings_owner_all ON event_listings;
CREATE POLICY event_listings_owner_all ON event_listings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM venue_profiles vp
      WHERE vp.id = event_listings.venue_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_profiles vp
      WHERE vp.id = event_listings.venue_id
        AND vp.user_id = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS event_listings_platform_all ON event_listings;
CREATE POLICY event_listings_platform_all ON event_listings
  FOR ALL
  USING (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'SERVICE'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afterdark_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON event_listings TO afterdark_app;
    RAISE NOTICE 'GRANTed event_listings access to afterdark_app';
  END IF;
END $$;
