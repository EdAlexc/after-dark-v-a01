-- 0008_messaging.sql — P5: conversations, messages, reports.
--
-- Participants are auth user ids (not profile ids) because PARTY users have
-- no marketplace profile yet can open private-party inquiries (§6.3).
-- Erasure: ON DELETE CASCADE from either participant removes the thread —
-- message content authored by a deleted user is their PII (retention.md §3).

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  venue_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  counterpart_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- GIG = talent↔venue negotiation; PARTY_INQUIRY = consumer booking inquiry.
  kind TEXT NOT NULL DEFAULT 'GIG' CHECK (kind IN ('GIG', 'PARTY_INQUIRY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_no_self CHECK (venue_user_id <> counterpart_user_id)
);

-- One thread per (gig, pair); gig-less threads dedupe on the pair + kind.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_gig
  ON conversations(gig_id, venue_user_id, counterpart_user_id) WHERE gig_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair
  ON conversations(venue_user_id, counterpart_user_id, kind) WHERE gig_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_venue ON conversations(venue_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_counterpart ON conversations(counterpart_user_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  -- Rate proposals are first-class messages (wireframe p6), money in cents.
  kind TEXT NOT NULL DEFAULT 'TEXT' CHECK (kind IN ('TEXT', 'RATE_PROPOSAL', 'SYSTEM')),
  rate_cents INTEGER CHECK (rate_cents IS NULL OR rate_cents >= 0),
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

-- Reports feed the P9 moderation queue (PRD admin p1).
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, severity);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_participant ON conversations;
CREATE POLICY conversations_participant ON conversations
  FOR ALL
  USING (
    venue_user_id = current_setting('app.user_id', true)
    OR counterpart_user_id = current_setting('app.user_id', true)
  )
  WITH CHECK (
    venue_user_id = current_setting('app.user_id', true)
    OR counterpart_user_id = current_setting('app.user_id', true)
  );

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_participant ON messages;
CREATE POLICY messages_participant ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.venue_user_id = current_setting('app.user_id', true)
          OR c.counterpart_user_id = current_setting('app.user_id', true))
    )
  )
  WITH CHECK (sender_id = current_setting('app.user_id', true));

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_create ON reports;
CREATE POLICY reports_create ON reports
  FOR INSERT WITH CHECK (reporter_id = current_setting('app.user_id', true));
DROP POLICY IF EXISTS reports_admin_read ON reports;
CREATE POLICY reports_admin_read ON reports
  FOR SELECT USING (current_setting('app.role', true) = 'ADMIN');
-- No UPDATE/DELETE policies for non-admins: triage is a P9 admin surface.
DROP POLICY IF EXISTS reports_admin_update ON reports;
CREATE POLICY reports_admin_update ON reports
  FOR UPDATE USING (current_setting('app.role', true) = 'ADMIN');
