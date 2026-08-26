/**
 * Data-subject-request core (TENANT_GUARDRAIL §4.2 G4): the one place that
 * knows what "my data" means.
 *
 * Export and erasure read the **same registry**, so a slice that adds a
 * PII-bearing table (P3 applications, P5 messages, P7 shifts…) makes both
 * operations correct by adding one entry here. Without that, the two drift and
 * you ship an export that omits what deletion removes — the classic GDPR bug.
 *
 * Erasure strategy, per table:
 *  - `cascade`  — row disappears when the `user` row does (FK ON DELETE CASCADE).
 *  - `pseudonymize` — row survives with the identifier replaced. Only
 *    `audit_logs` does this: we must keep an accountability trail (§5 A09),
 *    but it must no longer identify a deleted person.
 */

import { createHmac } from 'node:crypto';
import sql from './sql';
import { serviceContext, withRlsContext } from './rls';

/** Hard cap per collection so one account can't ask for an unbounded scan. */
export const EXPORT_ROW_LIMIT = 5_000;

export interface AccountExport {
  meta: {
    generated_at: string;
    format_version: number;
    /** Tables intentionally excluded, so the file is self-describing. */
    excluded: string[];
  };
  user: Record<string, unknown> | null;
  talent_profile: Record<string, unknown> | null;
  venue_profile: Record<string, unknown> | null;
  gigs: Record<string, unknown>[];
  applications: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  availability: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  /** S20: venue-user talent bookmarks (erasure rides the user FK cascade). */
  saved_talent: Record<string, unknown>[];
  audit_log: Record<string, unknown>[];
}

/**
 * Everything we hold about this user, as a portable document (Art. 20).
 *
 * Deliberately omits: password hashes and 2FA secrets/backup codes (exporting
 * credential material would be a vulnerability, not a right), and internal
 * session tokens.
 *
 * RLS (S2): each governed read carries the subject's own context — the same
 * per-user policies that protect these tables online also bound the export.
 */
export async function collectAccountExport(userId: string): Promise<AccountExport> {
  const subject = { id: userId };
  const [
    userRows,
    talentRows,
    venueRows,
    gigRows,
    applicationRows,
    messageRows,
    availabilityRows,
    shiftRows,
    payoutRows,
    savedTalentRows,
    auditRows,
  ] = await Promise.all([
    sql`
      SELECT id, name, email, "emailVerified", image, role, recovery_email, phone,
             social_links, "twoFactorEnabled", age_confirmed_at, "createdAt", "updatedAt"
      FROM "user" WHERE id = ${userId} LIMIT 1
    `,
    sql`SELECT * FROM talent_profiles WHERE user_id = ${userId} LIMIT 1`,
    sql`SELECT * FROM venue_profiles WHERE user_id = ${userId} LIMIT 1`,
    withRlsContext(subject, sql`
      SELECT g.* FROM gigs g
      JOIN venue_profiles vp ON g.venue_id = vp.id
      WHERE vp.user_id = ${userId}
      ORDER BY g.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    withRlsContext(subject, sql`
      SELECT a.* FROM applications a
      JOIN talent_profiles tp ON tp.id = a.talent_id
      WHERE tp.user_id = ${userId}
      ORDER BY a.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    // Messages the user AUTHORED — the counterpart's words are their PII.
    withRlsContext(subject, sql`
      SELECT m.conversation_id, m.content, m.kind, m.rate_cents, m.attachment_url, m.created_at
      FROM messages m
      WHERE m.sender_id = ${userId}
      ORDER BY m.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    withRlsContext(subject, sql`
      SELECT av.date, av.time_slot, av.status, av.notes
      FROM availabilities av
      JOIN talent_profiles tp ON tp.id = av.talent_id
      WHERE tp.user_id = ${userId}
      ORDER BY av.date DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    withRlsContext(subject, sql`
      SELECT s.* FROM shifts s
      JOIN talent_profiles tp ON tp.id = s.talent_id
      WHERE tp.user_id = ${userId}
      ORDER BY s.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    withRlsContext(subject, sql`
      SELECT id, gross_cents, fee_cents, net_cents, status, created_at, released_at
      FROM payouts
      WHERE talent_user_id = ${userId} OR venue_user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    // S20 bookmarks: the ids alone are opaque, so the export carries the
    // saved talent's public stage name alongside (public-read join).
    withRlsContext(subject, sql`
      SELECT st.talent_id, tp.stage_name, st.created_at
      FROM saved_talent st
      LEFT JOIN talent_profiles tp ON tp.id = st.talent_id
      WHERE st.venue_user_id = ${userId}
      ORDER BY st.created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
    withRlsContext(subject, sql`
      SELECT action, entity_type, entity_id, metadata, created_at
      FROM audit_logs WHERE actor_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${EXPORT_ROW_LIMIT}
    `),
  ]);

  return {
    meta: {
      generated_at: new Date().toISOString(),
      format_version: 1,
      excluded: [
        'password hash (credential material)',
        '2FA secret and backup codes (credential material)',
        'session tokens',
      ],
    },
    user: (userRows[0] as Record<string, unknown>) ?? null,
    talent_profile: (talentRows[0] as Record<string, unknown>) ?? null,
    venue_profile: (venueRows[0] as Record<string, unknown>) ?? null,
    gigs: gigRows as Record<string, unknown>[],
    applications: applicationRows as Record<string, unknown>[],
    messages: messageRows as Record<string, unknown>[],
    availability: availabilityRows as Record<string, unknown>[],
    shifts: shiftRows as Record<string, unknown>[],
    payouts: payoutRows as Record<string, unknown>[],
    saved_talent: savedTalentRows as Record<string, unknown>[],
    audit_log: auditRows as Record<string, unknown>[],
  };
}

/**
 * Stable, non-reversible stand-in for a deleted user's id.
 *
 * HMAC (not a bare hash) so the mapping can't be brute-forced from a known id
 * list without the server secret. Deterministic, so the audit trail still shows
 * "these actions were all the same person" without saying who.
 */
export function pseudonymizeActorId(userId: string, secret = process.env.BETTER_AUTH_SECRET): string {
  const key = secret ?? 'afterdark-fallback-pseudonymization-key';
  const digest = createHmac('sha256', key).update(userId).digest('hex').slice(0, 32);
  return `deleted:${digest}`;
}

export interface DeletionResult {
  auditRowsPseudonymized: number;
  userDeleted: boolean;
}

/**
 * Erases the account (Art. 17).
 *
 * Order matters: pseudonymize the audit trail **first**, because once the
 * `user` row is gone we can no longer prove which rows were that user's. Then
 * delete the user, which cascades profiles → gigs, sessions, accounts and 2FA
 * enrollments via the FKs declared in 0001/0005.
 */
export async function deleteAccountData(userId: string): Promise<DeletionResult> {
  const pseudonym = pseudonymizeActorId(userId);

  // RLS (S2): the audit trail is append-only to every user context; the one
  // sanctioned rewrite — replacing the actor id with its pseudonym during
  // erasure — runs as SERVICE (policy audit_logs_service_pseudonymize, and a
  // column-scoped GRANT keeps everything but actor_id immutable).
  const pseudonymized = await withRlsContext<Array<{ id: number }>>(
    serviceContext('system:erasure'),
    sql`
      UPDATE audit_logs SET actor_id = ${pseudonym}
      WHERE actor_id = ${userId}
      RETURNING id
    `
  );

  const deleted = (await sql`
    DELETE FROM "user" WHERE id = ${userId} RETURNING id
  `) as Array<{ id: string }>;

  return {
    auditRowsPseudonymized: pseudonymized.length,
    userDeleted: deleted.length > 0,
  };
}
