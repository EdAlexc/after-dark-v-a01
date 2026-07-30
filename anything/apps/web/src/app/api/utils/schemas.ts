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

// ─── Roles / onboarding ───────────────────────────────────────────────────────

/** Self-service roles. ADMIN is intentionally absent (privilege-escalation fix). */
export const SelfServiceRoleSchema = z.enum(['TALENT', 'VENUE', 'PARTY']);

export const RoleSelectionSchema = z.object({
  role: SelfServiceRoleSchema,
  subRole: shortText(80).optional(),
  stageName: shortText(80).optional(),
  venueName: shortText(120).optional(),
  neighborhood: shortText(80).optional(),
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
    start_time: timestamp,
    end_time: timestamp,
    base_rate: rate,
    tips_included: z.boolean().optional().default(false),
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
    minRate: rate.optional(),
    maxRate: rate.optional(),
    page,
  })
  .refine(
    (query) =>
      query.minRate === undefined || query.maxRate === undefined || query.minRate <= query.maxRate,
    { message: 'minRate must be ≤ maxRate', path: ['minRate'] }
  );

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

const totpToken = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'must be a 6-digit code');

/** Base32 (RFC 4648) secret as produced by our own enrollment flow. */
const totpSecret = z
  .string()
  .trim()
  .regex(/^[A-Z2-7]{16,64}$/i, 'invalid secret format');

export const TwoFactorActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enable'), secret: totpSecret, token: totpToken }),
  z.object({ action: z.literal('disable'), token: totpToken }),
]);

export type RoleSelection = z.infer<typeof RoleSelectionSchema>;
export type GigCreate = z.infer<typeof GigCreateSchema>;
export type GigListQuery = z.infer<typeof GigListQuerySchema>;
export type GigStatus = z.infer<typeof GigStatusSchema>;
export type TalentListQuery = z.infer<typeof TalentListQuerySchema>;
