import { describe, expect, it } from 'vitest';
import { TALENT_PAGE_SIZE, buildTalentListQuery } from '../talent-query';
import { TalentListQuerySchema } from '../schemas';

const EMPTY = TalentListQuerySchema.parse({});

describe('buildTalentListQuery', () => {
  it('q lands as one lowercased LIKE param across name/role/bio/genres (S17 F7)', () => {
    const { text, values } = buildTalentListQuery(TalentListQuerySchema.parse({ q: 'TECHNO' }));
    expect(values[0]).toBe('%techno%');
    expect(text).toContain('LOWER(stage_name) LIKE $1');
    expect(text).toContain('LOWER(primary_role) LIKE $1');
    expect(text).toContain("LOWER(COALESCE(bio, '')) LIKE $1");
    expect(text).toContain('LOWER(genres_vibes::text) LIKE $1');
    // q must never reach the SQL text itself.
    expect(text).not.toContain('techno');
  });


  it('only lists profiles with a stage name (unpublished-profile guard)', () => {
    const { text } = buildTalentListQuery(EMPTY);
    expect(text).toContain("stage_name IS NOT NULL AND stage_name <> ''");
  });

  it('selects only public-profile columns — no auth linkage', () => {
    const { text } = buildTalentListQuery(EMPTY);
    expect(text).not.toContain('user_id');
    expect(text).not.toContain('email');
    expect(text).not.toMatch(/"user"/);
    expect(text).not.toContain('totp');
  });

  it('numbers placeholders sequentially for every filter combination', () => {
    const { text, values } = buildTalentListQuery(
      TalentListQuerySchema.parse({
        neighborhood: 'Bushwick',
        role: 'DJ',
        minRate: '50',
        maxRate: '300',
        page: '2',
      })
    );
    expect(values).toEqual(['%Bushwick%', '%DJ%', 50, 300, TALENT_PAGE_SIZE + 1, TALENT_PAGE_SIZE]);
    expect(text).toContain('LOWER(neighborhood) LIKE LOWER($1)');
    expect(text).toContain('LOWER(primary_role) LIKE LOWER($2)');
    expect(text).toContain('hourly_rate_max >= $3');
    expect(text).toContain('hourly_rate_min <= $4');
    expect(text).toContain('LIMIT $5 OFFSET $6');
  });

  it('never interpolates user input into SQL text (SQLi regression)', () => {
    const payloads = ["'; DROP TABLE talent_profiles; --", "%' OR '1'='1", '$1; DELETE FROM gigs'];
    for (const payload of payloads) {
      const { text, values } = buildTalentListQuery(
        TalentListQuerySchema.parse({ neighborhood: payload.slice(0, 80) })
      );
      expect(text).not.toContain(payload);
      expect(values).toContain(`%${payload.slice(0, 80)}%`);
      expect(text.trim().startsWith('SELECT')).toBe(true);
      expect(text).not.toContain(';');
    }
  });

  it('treats rate filters as band overlap and excludes rate-less profiles when filtering', () => {
    const { text } = buildTalentListQuery(TalentListQuerySchema.parse({ minRate: '100' }));
    expect(text).toContain('hourly_rate_max IS NOT NULL');
    const without = buildTalentListQuery(EMPTY);
    expect(without.text).not.toContain('hourly_rate_max IS NOT NULL');
  });

  it('rejects minRate > maxRate at the schema layer', () => {
    expect(TalentListQuerySchema.safeParse({ minRate: '300', maxRate: '10' }).success).toBe(false);
  });

  // ─── Multi-value filters + availability boost (S5 / #27, #28) ──────────────
  it('sends multi-value filters as ONE array param via LIKE ANY', () => {
    const { text, values } = buildTalentListQuery(
      TalentListQuerySchema.parse({ roles: 'DJ, Mixologist', neighborhoods: 'LES' })
    );
    expect(text).toContain('LOWER(neighborhood) LIKE ANY($1)');
    expect(text).toContain('LOWER(primary_role) LIKE ANY($2)');
    expect(values[0]).toEqual(['%les%']);
    expect(values[1]).toEqual(['%dj%', '%mixologist%']);
  });

  it('boosts available-tonight first, then an open AVAILABLE slot today (#28)', () => {
    const { text } = buildTalentListQuery(EMPTY);
    const order = text.slice(text.indexOf('ORDER BY'));
    expect(order).toContain('available_tonight DESC');
    // The probe must go through the 0017 SECURITY DEFINER helper — a direct
    // EXISTS on availabilities silently stops boosting post-RLS-cutover.
    expect(order).toContain('app_talent_available_on(talent_profiles.id, CURRENT_DATE)');
    expect(order).not.toContain('FROM availabilities');
    // Tonight flag outranks the slot probe, which outranks completion.
    expect(order.indexOf('available_tonight')).toBeLessThan(
      order.indexOf('app_talent_available_on')
    );
    expect(order.indexOf('app_talent_available_on')).toBeLessThan(
      order.indexOf('profile_completion_pct')
    );
  });

  it('keeps the boost subquery free of user input (only parameters reach values)', () => {
    const { text } = buildTalentListQuery(
      TalentListQuerySchema.parse({ roles: "x'); DROP TABLE availabilities; --" })
    );
    expect(text).not.toContain('DROP TABLE');
  });
});
