/**
 * Targeted schema contracts (Q8) — the S15–S20 additions that had no suite:
 * gig age gating and the strict PATCH union, the conversation anchor set,
 * saved-talent's strict toggle body, geocode defaults, and notification
 * paging/read bounds. Broad parseBody/parseQuery + the older schemas are
 * covered in validation.test.ts; this file asserts the newer contracts.
 */

import { describe, expect, it } from 'vitest';
import {
  ConversationCreateSchema,
  GeocodePreviewQuerySchema,
  GigCreateSchema,
  GigPatchSchema,
  NotificationsListQuerySchema,
  NotificationsReadSchema,
  SavedTalentPutSchema,
} from '@/app/api/utils/schemas';

const UUID = '4b4b1c2e-8f6a-4f7e-9d2a-1234567890ab';

/** Minimal valid draft body (the wizard's save-draft shape). */
const draft = {
  title: 'Untitled Gig',
  role_needed: '',
  description: '',
  start_time: '',
  end_time: '',
  base_rate: 0,
};

describe('GigCreateSchema — age gating (G12)', () => {
  it('accepts only the platform floor 18 and the 21+ room', () => {
    expect(GigCreateSchema.parse({ ...draft, age_requirement: 18 }).age_requirement).toBe(18);
    expect(GigCreateSchema.parse({ ...draft, age_requirement: 21 }).age_requirement).toBe(21);
  });

  it('defaults to 18 when omitted', () => {
    expect(GigCreateSchema.parse(draft).age_requirement).toBe(18);
  });

  it.each([
    ['under-floor', 17],
    ['in-between', 19],
    ['over', 25],
    ['zero', 0],
    ['string "21" (no coercion)', '21'],
    ['null', null],
  ])('rejects %s', (_label, age) => {
    expect(GigCreateSchema.safeParse({ ...draft, age_requirement: age }).success).toBe(false);
  });

  it('strips smuggled fee/ownership fields rather than accepting them (non-strict object)', () => {
    // Actual behavior: zod's default object strips unknown keys — the
    // mass-assignment guard is stripping, not rejection.
    const parsed = GigCreateSchema.parse({
      ...draft,
      fee_pct: 0,
      is_featured: true,
      venue_id: 'someone-else',
    } as Record<string, unknown>);
    expect('fee_pct' in parsed).toBe(false);
    expect('is_featured' in parsed).toBe(false);
    expect('venue_id' in parsed).toBe(false);
  });
});

describe('GigPatchSchema — status arm XOR draft arm, both strict', () => {
  it('accepts a pure lifecycle transition body', () => {
    expect(GigPatchSchema.parse({ status: 'PUBLISHED' })).toEqual({ status: 'PUBLISHED' });
    expect(GigPatchSchema.parse({ status: 'CANCELLED' })).toEqual({ status: 'CANCELLED' });
  });

  it('accepts a pure draft re-save body (with the create-shape defaults)', () => {
    const parsed = GigPatchSchema.parse({
      title: 'Saturday Deep House',
      role_needed: 'DJ',
      start_time: '2026-09-05T22:00:00',
      end_time: '2026-09-06T04:00:00',
      base_rate: 300,
    });
    expect(parsed).toMatchObject({
      title: 'Saturday Deep House',
      description: '',
      tips_included: false,
      age_requirement: 18,
    });
    expect('status' in parsed).toBe(false);
  });

  it('rejects a body mixing content with status — no side-effect smuggling', () => {
    expect(
      GigPatchSchema.safeParse({
        status: 'PUBLISHED',
        title: 'Saturday Deep House',
        role_needed: 'DJ',
        start_time: '2026-09-05T22:00:00',
        end_time: '2026-09-06T04:00:00',
        base_rate: 300,
      }).success
    ).toBe(false);
  });

  it('rejects unknown keys on the status arm (strict, not stripped)', () => {
    expect(GigPatchSchema.safeParse({ status: 'PUBLISHED', is_featured: true }).success).toBe(
      false
    );
  });

  it('rejects unknown statuses and incomplete draft bodies', () => {
    expect(GigPatchSchema.safeParse({ status: 'NUKED' }).success).toBe(false);
    expect(GigPatchSchema.safeParse({ title: 'abc' }).success).toBe(false);
    expect(GigPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('ConversationCreateSchema — any single anchor opens a thread', () => {
  it.each([
    ['counterpart_user_id', { counterpart_user_id: 'user-abc' }],
    ['gig_id', { gig_id: UUID }],
    ['venue_id (S19 inquiry)', { venue_id: UUID }],
    ['talent_id (S20 outreach)', { talent_id: UUID }],
  ])('accepts %s alone', (_label, body) => {
    expect(ConversationCreateSchema.safeParse(body).success).toBe(true);
  });

  it('rejects an empty body and all-null anchors', () => {
    expect(ConversationCreateSchema.safeParse({}).success).toBe(false);
    expect(
      ConversationCreateSchema.safeParse({ gig_id: null, venue_id: null, talent_id: null }).success
    ).toBe(false);
  });

  it('rejects non-uuid profile anchors and an empty counterpart id', () => {
    expect(ConversationCreateSchema.safeParse({ talent_id: 'not-a-uuid' }).success).toBe(false);
    expect(ConversationCreateSchema.safeParse({ venue_id: '123' }).success).toBe(false);
    expect(ConversationCreateSchema.safeParse({ gig_id: 'DROP TABLE gigs' }).success).toBe(false);
    expect(ConversationCreateSchema.safeParse({ counterpart_user_id: '' }).success).toBe(false);
  });
});

describe('SavedTalentPutSchema — strict idempotent toggle', () => {
  it('accepts exactly { talent_id: uuid, saved: boolean }', () => {
    expect(SavedTalentPutSchema.parse({ talent_id: UUID, saved: true })).toEqual({
      talent_id: UUID,
      saved: true,
    });
    expect(SavedTalentPutSchema.parse({ talent_id: UUID, saved: false }).saved).toBe(false);
  });

  it('rejects extra keys (strict — nothing rides along)', () => {
    expect(
      SavedTalentPutSchema.safeParse({ talent_id: UUID, saved: true, note: 'hi' }).success
    ).toBe(false);
  });

  it('rejects non-uuid talent ids', () => {
    expect(SavedTalentPutSchema.safeParse({ talent_id: 'abc', saved: true }).success).toBe(false);
    expect(SavedTalentPutSchema.safeParse({ talent_id: 42, saved: true }).success).toBe(false);
  });

  it('rejects non-boolean saved and missing fields', () => {
    expect(SavedTalentPutSchema.safeParse({ talent_id: UUID, saved: 'true' }).success).toBe(false);
    expect(SavedTalentPutSchema.safeParse({ talent_id: UUID, saved: 1 }).success).toBe(false);
    expect(SavedTalentPutSchema.safeParse({ talent_id: UUID }).success).toBe(false);
    expect(SavedTalentPutSchema.safeParse({ saved: true }).success).toBe(false);
  });
});

describe('GeocodePreviewQuerySchema', () => {
  it("defaults a missing address to '' (empty wizard field costs nothing)", () => {
    expect(GeocodePreviewQuerySchema.parse({})).toEqual({ address: '' });
  });

  it('passes a present address through and caps its length', () => {
    expect(GeocodePreviewQuerySchema.parse({ address: '55 W 25th St' }).address).toBe(
      '55 W 25th St'
    );
    expect(GeocodePreviewQuerySchema.safeParse({ address: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('NotificationsListQuerySchema — bounded page coercion', () => {
  it("coerces '2' → 2 and defaults to page 1", () => {
    expect(NotificationsListQuerySchema.parse({ page: '2' }).page).toBe(2);
    expect(NotificationsListQuerySchema.parse({}).page).toBe(1);
  });

  it('bounds page to 1..500 and rejects non-integers', () => {
    expect(NotificationsListQuerySchema.parse({ page: '500' }).page).toBe(500);
    expect(NotificationsListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(NotificationsListQuerySchema.safeParse({ page: '501' }).success).toBe(false);
    expect(NotificationsListQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
    expect(NotificationsListQuerySchema.safeParse({ page: '2.5' }).success).toBe(false);
    expect(NotificationsListQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
  });
});

describe('NotificationsReadSchema — mark-read id list', () => {
  it('accepts an omitted list (mark everything read) and up to 100 ids', () => {
    expect(NotificationsReadSchema.parse({}).ids).toBeUndefined();
    expect(NotificationsReadSchema.parse({ ids: [1, 2, 3] }).ids).toEqual([1, 2, 3]);
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(NotificationsReadSchema.safeParse({ ids: hundred }).success).toBe(true);
  });

  it('rejects more than 100 ids', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(NotificationsReadSchema.safeParse({ ids: tooMany }).success).toBe(false);
  });

  it('rejects non-positive, fractional, and string ids', () => {
    expect(NotificationsReadSchema.safeParse({ ids: [0] }).success).toBe(false);
    expect(NotificationsReadSchema.safeParse({ ids: [-3] }).success).toBe(false);
    expect(NotificationsReadSchema.safeParse({ ids: [1.5] }).success).toBe(false);
    expect(NotificationsReadSchema.safeParse({ ids: ['7'] }).success).toBe(false);
    expect(NotificationsReadSchema.safeParse({ ids: 7 }).success).toBe(false);
  });
});
