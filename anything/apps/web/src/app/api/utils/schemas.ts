/**
 * zod schemas for every API surface (TENANT_GUARDRAIL §5 A01/A03/A04).
 *
 * Conventions:
 *  - every string is trimmed and length-capped;
 *  - unknown keys are silently stripped (zod object default) — clients may
 *    post whole form-state objects without widening the write surface;
 *  - self-service roles NEVER include ADMIN (§6.1 authZ matrix) — admin is
 *    granted out-of-band only;
 *  - media fields temporarily carry base64 data URLs (pre-object-storage),
 *    so they get explicit size caps rather than URL validation.
 */

import { z } from 'zod';

// ─── Shared field helpers ─────────────────────────────────────────────────────

const shortText = (max: number) => z.string().trim().max(max);

/** Parseable timestamp string (ISO or datetime-local); '' → null. */
const timestamp = z
  .string()
  .trim()
  .max(40)
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: 'must be a valid date/time',
  });

/** Money-ish rate in dollars. Bounded to keep math and DB sane. */
const rate = z.coerce.number().finite().min(0).max(1_000_000);

/** Base64 data URL or https URL for media (placeholder until object storage). */
const mediaString = z.string().max(2_000_000);

const socialLinks = z
  .record(shortText(40), z.string().trim().max(300))
  .refine((obj) => Object.keys(obj).length <= 12, { message: 'too many entries' });

/**
 * Comma-separated multi-value query param (S5 / Backlog #27) — parseQuery is
 * single-valued, so lists ride as CSV: `roles=DJ,Bartender`. Items are
 * trimmed, empties dropped, count and length bounded.
 */
const csvList = (maxItems: number, maxItemLength: number) =>
  z
    .string()
    .max(maxItems * (maxItemLength + 1))
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
    .refine((items) => items.length <= maxItems, { message: `at most ${maxItems} values` })
    .refine((items) => items.every((item) => item.length <= maxItemLength), {
      message: `each value must be ≤ ${maxItemLength} characters`,
    });

// ─── Roles / onboarding ───────────────────────────────────────────────────────

/** Self-service roles. ADMIN is intentionally absent (privilege-escalation fix). */
export const SelfServiceRoleSchema = z.enum(['TALENT', 'VENUE', 'PARTY']);

// nullish, not optional: the onboarding form posts `null` for skipped fields
// (found live — a tester who skips the sub-role chip got a 400 pre-S4–S10).
export const RoleSelectionSchema = z.object({
  role: SelfServiceRoleSchema,
  subRole: shortText(80).nullish(),
  stageName: shortText(80).nullish(),
  venueName: shortText(120).nullish(),
  neighborhood: shortText(80).nullish(),
});

// ─── Gigs ─────────────────────────────────────────────────────────────────────

/** Full lifecycle (P1.3). Creation is still restricted to DRAFT|PUBLISHED. */
export const GigStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'FILLED',
  'COMPLETED',
  'CANCELLED',
]);

/** Owner-only status transition body for PATCH /api/gigs/[id]. */
export const GigStatusUpdateSchema = z.object({ status: GigStatusSchema });

/** Path id for /api/gigs/[id] — reject non-UUIDs before they reach Postgres. */
export const GigIdSchema = z.string().uuid();

/** 1-based page for public listings; bounded so OFFSET stays sane. */
const page = z.coerce.number().int().min(1).max(500).optional().default(1);

export const GigCreateSchema = z
  .object({
    title: shortText(120).min(3),
    role_needed: shortText(80),
    description: shortText(5000).optional().default(''),
    /** Gig venue address (S10) — geocoded server-side; falls back to the
     *  venue profile's address when omitted. */
    address: shortText(200).optional(),
    start_time: timestamp,
    end_time: timestamp,
    base_rate: rate,
    tips_included: z.boolean().optional().default(false),
    // Minimum age to work the gig (G12). Only the platform floor (18) and the
    // alcohol-service/21+ room are valid — matches the DB CHECK in 0006.
    age_requirement: z
      .union([z.literal(18), z.literal(21)])
      .optional()
      .default(18),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
  })
  .superRefine((gig, ctx) => {
    if (gig.status !== 'PUBLISHED') return;
    // Publishing gates: drafts may be incomplete, public listings may not.
    if (gig.role_needed.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['role_needed'], message: 'required to publish' });
    }
    if (gig.start_time === null || gig.end_time === null) {
      ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'required to publish' });
      return;
    }
    if (Date.parse(gig.end_time) <= Date.parse(gig.start_time)) {
      ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'must be after start_time' });
    }
  });

/**
 * Public gig listing filters. `status` is NOT accepted — the public endpoint
 * only ever serves PUBLISHED gigs (draft leakage fix).
 */
export const GigListQuerySchema = z
  .object({
    neighborhood: shortText(80).optional(),
    role: shortText(80).optional(),
    /** Multi-value variants (S5, CSV). When present they supersede the
     *  single-value params — the UI sends one form or the other. */
    neighborhoods: csvList(10, 80).optional(),
    roles: csvList(10, 80).optional(),
    minRate: rate.optional(),
    maxRate: rate.optional(),
    tonightOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    page,
  })
  .refine(
    (query) =>
      query.minRate === undefined || query.maxRate === undefined || query.minRate <= query.maxRate,
    { message: 'minRate must be ≤ maxRate', path: ['minRate'] }
  );

/**
 * Public talent directory filters (venue browse). Same conventions as the gig
 * listing: only public-profile fields are filterable, page is bounded.
 */
export const TalentListQuerySchema = z
  .object({
    neighborhood: shortText(80).optional(),
    role: shortText(80).optional(),
    neighborhoods: csvList(10, 80).optional(),
    roles: csvList(10, 80).optional(),
    minRate: rate.optional(),
    maxRate: rate.optional(),
    page,
  })
  .refine(
    (query) =>
      query.minRate === undefined || query.maxRate === undefined || query.minRate <= query.maxRate,
    { message: 'minRate must be ≤ maxRate', path: ['minRate'] }
  );

// ─── Global search (S5 / Backlog #7) ─────────────────────────────────────────

/**
 * Public search over gigs + talent. The term feeds `plainto_tsquery` ONLY —
 * never raw tsquery syntax — so no query-language injection is possible.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'query too short').max(120),
  /** Restrict to one entity type; omitted = both. */
  type: z.enum(['gigs', 'talent']).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

// ─── Matching engine (S7 / Backlog #6) ───────────────────────────────────────

/** Create-gig "Live Analysis" preview inputs (VENUE-only endpoint). */
export const MatchPreviewQuerySchema = z.object({
  role: shortText(80).min(2),
  rate: rate.optional(),
  /** Gig date for the availability probe. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional(),
});

// ─── Profiles ─────────────────────────────────────────────────────────────────

export const TalentProfileUpdateSchema = z.object({
  stage_name: shortText(80).optional(),
  pronouns: shortText(40).optional(),
  neighborhood: shortText(80).optional(),
  bio: shortText(500).optional(), // 500-char limit per wireframe p9
  primary_role: shortText(80).optional(),
  genres_vibes: z.array(shortText(40)).max(30).optional(),
  hourly_rate_min: rate.nullish(),
  hourly_rate_max: rate.nullish(),
  social_links: socialLinks.optional(),
  avatar_url: mediaString.optional(),
  portfolio_images: z.array(mediaString).max(5).optional(), // headshot + 4 shots (p9)
  /** Available Tonight boost (P6) — public flag, floats the profile in browse. */
  available_tonight: z.boolean().optional(),
});

export const VenueProfileUpdateSchema = z.object({
  venue_name: shortText(120).optional(),
  neighborhood: shortText(80).optional(),
  address: shortText(200).optional(),
  description: shortText(2000).optional(),
  venue_type: shortText(60).optional(),
  capacity: z.coerce.number().int().min(0).max(500_000).nullish(),
  music_genres: z.array(shortText(40)).max(30).optional(),
  operating_hours: z.record(shortText(20), shortText(60)).optional(),
  avatar_url: mediaString.optional(),
  gallery_images: z.array(mediaString).max(8).optional(),
  social_links: socialLinks.optional(),
});

// ─── Settings / account security ──────────────────────────────────────────────

export const SettingsUpdateSchema = z.object({
  name: shortText(120).min(1).optional(),
  recovery_email: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  phone: z
    .union([z.literal(''), z.string().trim().regex(/^[+()\d\s.-]{7,30}$/, 'invalid phone number')])
    .optional(),
  social_links: socialLinks.optional(),
  image: mediaString.optional(),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8, 'must be at least 8 characters').max(200),
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: 'new password must differ from current password',
    path: ['newPassword'],
  });

// 2FA enrollment/verification bodies are validated by the better-auth
// twoFactor plugin's own endpoints (Backlog #17) — no app schema needed.

// ─── Applications (P3) ────────────────────────────────────────────────────────

/** Money is integer cents (§11); $10k/hr cap keeps math and UI sane. */
const rateCents = z.number().int().min(0).max(1_000_000);

export const ApplicationCreateSchema = z.object({
  /** null/omitted = accept the gig's base rate. */
  proposed_rate_cents: rateCents.nullish(),
  cover_message: shortText(2000).optional().default(''),
});

export const ApplicationStatusUpdateSchema = z.object({
  status: z.enum(['SHORTLISTED', 'HIRED', 'REJECTED', 'WITHDRAWN']),
});

export const ApplicationIdSchema = z.string().uuid();

// ─── Notifications (P3.4) ─────────────────────────────────────────────────────

export const NotificationsReadSchema = z.object({
  /** Omitted = mark everything read. */
  ids: z.array(z.number().int().positive()).max(100).optional(),
});

// ─── Messaging (P5) ───────────────────────────────────────────────────────────

export const ConversationCreateSchema = z
  .object({
    /** The user to talk to. Optional when gig_id is given — the server
     *  resolves the gig's venue, so venue user ids never ride the client. */
    counterpart_user_id: z.string().min(1).max(64).optional(),
    gig_id: z.string().uuid().nullish(),
  })
  .refine((body) => body.counterpart_user_id || body.gig_id, {
    message: 'counterpart_user_id or gig_id is required',
  });

export const MessageCreateSchema = z
  .object({
    content: shortText(4000).optional().default(''),
    kind: z.enum(['TEXT', 'RATE_PROPOSAL']).optional().default('TEXT'),
    rate_cents: rateCents.nullish(),
    attachment_url: z.string().max(2000).nullish(),
  })
  .superRefine((message, ctx) => {
    if (message.kind === 'RATE_PROPOSAL' && message.rate_cents == null) {
      ctx.addIssue({ code: 'custom', path: ['rate_cents'], message: 'required for a proposal' });
    }
    if (message.kind === 'TEXT' && message.content.length === 0 && !message.attachment_url) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'message is empty' });
    }
  });

export const AcceptRateSchema = z.object({
  message_id: z.string().uuid(),
});

export const ReportCreateSchema = z.object({
  entity_type: z.enum(['conversation', 'user', 'gig', 'review']),
  entity_id: shortText(64).min(1),
  reason: shortText(2000).min(3),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('MEDIUM'),
});

// ─── Web Push (S9) ───────────────────────────────────────────────────────────

/** Browser PushSubscription.toJSON() shape — bounds mirror 0019's CHECKs. */
export const PushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

// ─── Reviews & trust (S8) ────────────────────────────────────────────────────

export const ReviewCreateSchema = z.object({
  shift_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: shortText(1000).optional().default(''),
});

/** Public review listing — exactly one subject. */
export const ReviewsListQuerySchema = z
  .object({
    venue_id: z.string().uuid().optional(),
    talent_id: z.string().uuid().optional(),
  })
  .refine((query) => Boolean(query.venue_id) !== Boolean(query.talent_id), {
    message: 'exactly one of venue_id or talent_id is required',
  });

// ─── Availability (P6) ────────────────────────────────────────────────────────

export const TIME_SLOTS = ['EARLY_EVENING', 'PRIME_TIME', 'AFTER_HOURS'] as const;

export const AvailabilityQuerySchema = z.object({
  /** Calendar month, e.g. 2026-08. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM'),
});

export const AvailabilityPutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  /** Absent slots are cleared for that day (partialRecord: zod v4's plain
   *  record with enum keys would demand all three every time). */
  slots: z.partialRecord(z.enum(TIME_SLOTS), z.enum(['AVAILABLE', 'BLOCKED'])),
  notes: shortText(500).optional().default(''),
});

// ─── Shifts (P7) ──────────────────────────────────────────────────────────────

export const ShiftTransitionSchema = z.object({
  to: z.enum(['IN_TRANSIT', 'CHECKED_IN', 'CHECKED_OUT']),
  /** Client-generated; backed by a DB unique constraint (§6.3). */
  idempotency_key: z.string().min(8).max(64),
});

export const ShiftIdSchema = z.string().uuid();

// ─── Media uploads (P4) ───────────────────────────────────────────────────────

export const UploadSchema = z.object({
  /** data URL: data:image/…;base64,… (or application/pdf for tech riders). */
  dataUrl: z.string().max(8_000_000),
  purpose: z.enum(['avatar', 'portfolio', 'gallery', 'attachment']).optional().default('avatar'),
});

// ─── Admin & trust (P9) ───────────────────────────────────────────────────────

export const AdminReportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'REVIEWING', 'CLOSED']).optional(),
});

/** Triage transition. OPEN→REVIEWING→CLOSED (or straight to CLOSED). */
export const AdminReportUpdateSchema = z.object({
  status: z.enum(['REVIEWING', 'CLOSED']),
  resolution_note: shortText(2000).optional(),
});

export const AdminUsersQuerySchema = z.object({
  q: shortText(120).optional(),
  role: z.enum(['TALENT', 'VENUE', 'PARTY', 'ADMIN']).optional(),
  /** flagged = has at least one non-closed report against them, or suspended. */
  flagged: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

export const AdminUserUpdateSchema = z.object({
  suspended: z.boolean(),
  /** Required when suspending; shown to the user on their 403. */
  reason: shortText(500).optional(),
});

export const AdminGigsQuerySchema = z.object({
  status: GigStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

/** Moderation takedown is the only admin gig write. */
export const AdminGigUpdateSchema = z.object({
  status: z.literal('CANCELLED'),
  reason: shortText(500).optional(),
});

export const AdminAuditQuerySchema = z.object({
  actor: shortText(120).optional(),
  action: shortText(120).optional(),
  entity_type: shortText(60).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export const ReportIdSchema = z.coerce.number().int().min(1);
export const UserIdSchema = z.string().min(1).max(64);

// ─── Account / data-subject requests (G4) ─────────────────────────────────────

/** Erasure requires the password again plus a typed confirmation. */
export const AccountDeleteSchema = z.object({
  password: z.string().min(1).max(200),
  confirm: z.string().trim().max(20),
});

export type RoleSelection = z.infer<typeof RoleSelectionSchema>;
export type GigCreate = z.infer<typeof GigCreateSchema>;
export type GigListQuery = z.infer<typeof GigListQuerySchema>;
export type GigStatus = z.infer<typeof GigStatusSchema>;
export type TalentListQuery = z.infer<typeof TalentListQuerySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
