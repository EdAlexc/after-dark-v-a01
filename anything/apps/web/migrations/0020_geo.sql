-- 0020_geo.sql — S10 map view (Backlog #1).
--
-- Gig coordinates for the browse map (wireframe p2). The gig's own address
-- (wizard p3 Logistics) is persisted now too — until here it was collected
-- and dropped; the venue-profile address remains the geocoding fallback.
-- lat/lng are written ONLY by the server-side geocoder (never client input),
-- so a pin can't be spoofed away from the stated address.

ALTER TABLE gigs
  ADD COLUMN IF NOT EXISTS address TEXT CHECK (address IS NULL OR char_length(address) <= 200),
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180));

-- The map fetches PUBLISHED gigs with coordinates; partial index keeps it tight.
CREATE INDEX IF NOT EXISTS idx_gigs_geo
  ON gigs (status, lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
