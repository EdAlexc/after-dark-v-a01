import { describe, expect, it } from 'vitest';
import { GIG_LIST_LIMIT, GIG_PAGE_SIZE, buildGigsListQuery } from '../gigs-query';
import { GigListQuerySchema } from '../schemas';

const EMPTY = GigListQuerySchema.parse({});

describe('buildGigsListQuery', () => {
  it('always pins status to PUBLISHED as $1 (draft-leak regression)', () => {
    const { text, values } = buildGigsListQuery(EMPTY);
    expect(text).toContain('g.status = $1');
    expect(values[0]).toBe('PUBLISHED');
    expect(text).not.toMatch(/DRAFT/);
  });

  it('numbers placeholders sequentially for every filter combination', () => {
    const { text, values } = buildGigsListQuery(
      GigListQuerySchema.parse({
        neighborhood: 'Bushwick',
        role: 'DJ',
        minRate: '50',
        maxRate: '300',
        tonightOnly: 'true',
      })
    );
    expect(values).toEqual(['PUBLISHED', '%Bushwick%', '%DJ%', 50, 300, GIG_PAGE_SIZE + 1, 0]);
    // Neighborhood matches the venue's neighborhood column OR its address.
    expect(text).toContain('LOWER(vp.neighborhood) LIKE LOWER($2)');
    expect(text).toContain('LOWER(vp.address) LIKE LOWER($2)');
    expect(text).toContain('LIKE LOWER($3)');
    expect(text).toContain('base_rate >= $4');
    expect(text).toContain('base_rate <= $5');
    // Tonight = rolling 24h window (UTC-date matching drops late-night gigs).
    expect(text).toContain("g.start_time < NOW() + INTERVAL '24 hours'");
    expect(text).toContain('LIMIT $6 OFFSET $7');
  });

  it('keeps placeholder numbering dense when only later filters are present', () => {
    const { text, values } = buildGigsListQuery(GigListQuerySchema.parse({ maxRate: '100' }));
    expect(text).toContain('base_rate <= $2');
    expect(values).toEqual(['PUBLISHED', 100, GIG_PAGE_SIZE + 1, 0]);
  });

  it('never interpolates user input into SQL text (SQLi regression)', () => {
    const payloads = [
      "'; DROP TABLE gigs; --",
      "%' OR '1'='1",
      'UNION SELECT totp_secret FROM "user"--',
      '$1; DELETE FROM gigs',
    ];
    for (const payload of payloads) {
      const { text, values } = buildGigsListQuery(
        GigListQuerySchema.parse({ neighborhood: payload.slice(0, 80), role: payload.slice(0, 80) })
      );
      expect(text).not.toContain(payload);
      expect(values).toContain(`%${payload.slice(0, 80)}%`);
      // Structure stays intact: one SELECT, no statement separator.
      expect(text.trim().startsWith('SELECT')).toBe(true);
      expect(text).not.toContain(';');
    }
  });

  it('paginates via parameterized LIMIT/OFFSET with a bounded page size', () => {
    expect(GIG_PAGE_SIZE + 1).toBeLessThanOrEqual(GIG_LIST_LIMIT);

    const page1 = buildGigsListQuery(EMPTY);
    expect(page1.values.slice(-2)).toEqual([GIG_PAGE_SIZE + 1, 0]);

    const page3 = buildGigsListQuery(GigListQuerySchema.parse({ page: '3' }));
    expect(page3.values.slice(-2)).toEqual([GIG_PAGE_SIZE + 1, 2 * GIG_PAGE_SIZE]);
  });

  it('rejects out-of-range pages at the schema layer', () => {
    expect(GigListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(GigListQuerySchema.safeParse({ page: '501' }).success).toBe(false);
    expect(GigListQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(GigListQuerySchema.parse({}).page).toBe(1);
  });

  it('omits rate clauses when rates are 0-vs-undefined correctly (0 is a real filter)', () => {
    const withZero = buildGigsListQuery(GigListQuerySchema.parse({ minRate: '0' }));
    expect(withZero.text).toContain('base_rate >= $2');
    expect(withZero.values).toEqual(['PUBLISHED', 0, GIG_PAGE_SIZE + 1, 0]);
    const without = buildGigsListQuery(EMPTY);
    expect(without.text).not.toContain('base_rate');
  });

  // ─── Multi-value filters (S5 / #27) ────────────────────────────────────────
  it('sends multi-value filters as ONE array param via LIKE ANY (no per-item text)', () => {
    const { text, values } = buildGigsListQuery(
      GigListQuerySchema.parse({ neighborhoods: 'SoHo, Tribeca', roles: 'DJ,Bartender' })
    );
    expect(text).toContain('LOWER(vp.neighborhood) LIKE ANY($2)');
    expect(text).toContain('LOWER(g.role_needed) LIKE ANY($3)');
    expect(values[1]).toEqual(['%soho%', '%tribeca%']);
    expect(values[2]).toEqual(['%dj%', '%bartender%']);
  });

  it('multi-value params supersede the single-value ones', () => {
    const { text, values } = buildGigsListQuery(
      GigListQuerySchema.parse({ neighborhoods: 'LES', neighborhood: 'Chelsea' })
    );
    expect(text).toContain('LIKE ANY($2)');
    expect(values[1]).toEqual(['%les%']);
    expect(values).not.toContain('%Chelsea%');
  });

  it('never interpolates multi-value input into SQL text (SQLi regression)', () => {
    const payload = "'; DROP TABLE gigs; --";
    const { text, values } = buildGigsListQuery(
      GigListQuerySchema.parse({ roles: payload.slice(0, 80) })
    );
    expect(text).not.toContain(payload);
    expect(values[1]).toEqual([`%${payload.slice(0, 80).toLowerCase()}%`]);
    expect(text).not.toContain(';');
  });

  it('rejects oversized value lists at the schema layer', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `n${i}`).join(',');
    expect(GigListQuerySchema.safeParse({ neighborhoods: tooMany }).success).toBe(false);
    expect(GigListQuerySchema.safeParse({ roles: 'x'.repeat(81) }).success).toBe(false);
  });
});
