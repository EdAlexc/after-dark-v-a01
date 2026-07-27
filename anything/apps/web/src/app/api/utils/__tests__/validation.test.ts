import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseBody, parseQuery } from '../validation';
import { ApiError } from '../route-kit';
import {
  ChangePasswordSchema,
  GigCreateSchema,
  GigListQuerySchema,
  RoleSelectionSchema,
  SettingsUpdateSchema,
  TalentProfileUpdateSchema,
  TwoFactorActionSchema,
} from '../schemas';

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function expectApiError(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  try {
    await promise;
    expect.unreachable('expected ApiError');
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    if (pattern) expect((err as ApiError).message).toMatch(pattern);
  }
}

describe('parseBody', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('returns typed data for valid bodies', async () => {
    await expect(parseBody(jsonRequest({ name: 'ok' }), schema)).resolves.toEqual({ name: 'ok' });
  });

  it('strips unknown keys (mass-assignment guard)', async () => {
    const data = await parseBody(jsonRequest({ name: 'ok', role: 'ADMIN', id: 'x' }), schema);
    expect(data).toEqual({ name: 'ok' });
  });

  it('rejects malformed JSON with 400', async () => {
    await expectApiError(parseBody(jsonRequest('{not json'), schema), 400, /Malformed JSON/);
  });

  it('rejects empty and whitespace-only bodies with 400', async () => {
    await expectApiError(parseBody(jsonRequest(''), schema), 400, /required/);
    await expectApiError(parseBody(jsonRequest('   '), schema), 400, /required/);
  });

  it('rejects oversized bodies with 413 before parsing', async () => {
    const huge = JSON.stringify({ name: 'x'.repeat(200_000) });
    await expectApiError(parseBody(jsonRequest(huge), schema), 413);
  });

  it('honors a custom maxBytes (multibyte-safe)', async () => {
    const body = JSON.stringify({ name: '🎧🎧🎧🎧' }); // 4 chars, 16 UTF-8 bytes
    await expectApiError(parseBody(jsonRequest(body), schema, { maxBytes: 20 }), 413);
  });

  it('reports which fields failed', async () => {
    await expectApiError(parseBody(jsonRequest({ name: '' }), schema), 400, /name/);
  });

  it('rejects non-object roots the schema does not accept', async () => {
    await expectApiError(parseBody(jsonRequest('"just a string"'), schema), 400);
    await expectApiError(parseBody(jsonRequest('null'), schema), 400);
  });
});

describe('parseQuery', () => {
  const schema = z.object({ q: z.string().max(10).optional() });

  it('parses present params and ignores repeats after the first', () => {
    expect(parseQuery('http://x.local/api?q=hello&q=world', schema)).toEqual({ q: 'hello' });
  });

  it('accepts missing optional params', () => {
    expect(parseQuery('http://x.local/api', schema)).toEqual({});
  });

  it('throws 400 on invalid params', () => {
    expect(() => parseQuery('http://x.local/api?q=elevenchars!', schema)).toThrow(ApiError);
  });
});

describe('RoleSelectionSchema (privilege-escalation regression)', () => {
  it('accepts self-service roles', () => {
    for (const role of ['TALENT', 'VENUE', 'PARTY']) {
      expect(RoleSelectionSchema.parse({ role }).role).toBe(role);
    }
  });

  it.each([
    ['ADMIN', 'ADMIN'],
    ['admin lowercase', 'admin'],
    ['Admin mixed', 'Admin'],
    ['padded admin', ' ADMIN '],
    ['empty', ''],
    ['unknown', 'SUPERUSER'],
  ])('rejects %s', (_label, role) => {
    expect(RoleSelectionSchema.safeParse({ role }).success).toBe(false);
  });

  it('rejects non-string roles and missing role', () => {
    expect(RoleSelectionSchema.safeParse({}).success).toBe(false);
    expect(RoleSelectionSchema.safeParse({ role: ['TALENT'] }).success).toBe(false);
    expect(RoleSelectionSchema.safeParse({ role: { $eq: 'ADMIN' } }).success).toBe(false);
  });

  it('caps companion field lengths', () => {
    expect(
      RoleSelectionSchema.safeParse({ role: 'TALENT', stageName: 'x'.repeat(81) }).success
    ).toBe(false);
  });
});

describe('GigCreateSchema', () => {
  const draft = {
    title: 'Untitled Gig',
    role_needed: '',
    description: '',
    start_time: '2026-01-01T00:00:00',
    end_time: '2026-01-01T06:00:00',
    base_rate: 0,
    tips_included: false,
    status: 'DRAFT',
  };

  it('accepts an incomplete DRAFT (wizard save-draft flow)', () => {
    expect(GigCreateSchema.parse(draft).status).toBe('DRAFT');
  });

  it('defaults status to DRAFT and tips to false', () => {
    const gig = GigCreateSchema.parse({ ...draft, status: undefined, tips_included: undefined });
    expect(gig.status).toBe('DRAFT');
    expect(gig.tips_included).toBe(false);
  });

  it('accepts a complete PUBLISHED gig', () => {
    const gig = GigCreateSchema.parse({
      ...draft,
      title: 'Saturday Deep House',
      role_needed: 'Headliner DJ',
      base_rate: 450,
      status: 'PUBLISHED',
    });
    expect(gig.status).toBe('PUBLISHED');
  });

  it('requires role/times to publish', () => {
    expect(GigCreateSchema.safeParse({ ...draft, status: 'PUBLISHED' }).success).toBe(false);
    expect(
      GigCreateSchema.safeParse({
        ...draft,
        role_needed: 'DJ',
        start_time: '',
        status: 'PUBLISHED',
      }).success
    ).toBe(false);
  });

  it('rejects end before/equal to start when publishing', () => {
    const base = { ...draft, role_needed: 'DJ', status: 'PUBLISHED' };
    expect(
      GigCreateSchema.safeParse({
        ...base,
        start_time: '2026-01-01T06:00:00',
        end_time: '2026-01-01T00:00:00',
      }).success
    ).toBe(false);
    expect(
      GigCreateSchema.safeParse({
        ...base,
        start_time: '2026-01-01T06:00:00',
        end_time: '2026-01-01T06:00:00',
      }).success
    ).toBe(false);
  });

  it('allows overnight spans crossing midnight when publishing', () => {
    expect(
      GigCreateSchema.safeParse({
        ...draft,
        role_needed: 'DJ',
        start_time: '2026-01-01T23:00:00',
        end_time: '2026-01-02T04:00:00',
        status: 'PUBLISHED',
      }).success
    ).toBe(true);
  });

  it('turns empty time strings into null (draft) and rejects garbage dates', () => {
    const gig = GigCreateSchema.parse({ ...draft, start_time: '', end_time: '' });
    expect(gig.start_time).toBeNull();
    expect(gig.end_time).toBeNull();
    expect(GigCreateSchema.safeParse({ ...draft, start_time: 'not-a-date' }).success).toBe(false);
  });

  it('bounds base_rate and rejects negatives/NaN/Infinity', () => {
    expect(GigCreateSchema.safeParse({ ...draft, base_rate: -1 }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, base_rate: Number.NaN }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, base_rate: Infinity }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, base_rate: 1_000_001 }).success).toBe(false);
  });

  it('rejects unknown status values (no FILLED yet, no injection)', () => {
    expect(GigCreateSchema.safeParse({ ...draft, status: 'FILLED' }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, status: "'; DROP TABLE gigs;--" }).success).toBe(
      false
    );
  });

  it('caps title/description lengths', () => {
    expect(GigCreateSchema.safeParse({ ...draft, title: 'ab' }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, title: 'x'.repeat(121) }).success).toBe(false);
    expect(GigCreateSchema.safeParse({ ...draft, description: 'x'.repeat(5001) }).success).toBe(
      false
    );
  });
});

describe('GigListQuerySchema', () => {
  it('parses full filter set with coercions', () => {
    const query = GigListQuerySchema.parse({
      neighborhood: 'Bushwick',
      role: 'DJ',
      minRate: '50',
      maxRate: '300',
      tonightOnly: 'true',
    });
    expect(query).toEqual({
      neighborhood: 'Bushwick',
      role: 'DJ',
      minRate: 50,
      maxRate: 300,
      tonightOnly: true,
    });
  });

  it('does not accept a status filter (drafts stay private)', () => {
    const parsed = GigListQuerySchema.parse({ status: 'DRAFT' } as Record<string, string>);
    expect('status' in parsed).toBe(false);
  });

  it('rejects minRate > maxRate', () => {
    expect(GigListQuerySchema.safeParse({ minRate: '300', maxRate: '50' }).success).toBe(false);
  });

  it('rejects non-numeric and negative rates', () => {
    expect(GigListQuerySchema.safeParse({ minRate: 'abc' }).success).toBe(false);
    expect(GigListQuerySchema.safeParse({ minRate: '-5' }).success).toBe(false);
  });

  it('treats tonightOnly=false and absent as false, rejects junk', () => {
    expect(GigListQuerySchema.parse({ tonightOnly: 'false' }).tonightOnly).toBe(false);
    expect(GigListQuerySchema.parse({}).tonightOnly).toBe(false);
    expect(GigListQuerySchema.safeParse({ tonightOnly: '1' }).success).toBe(false);
  });
});

describe('profile & settings schemas', () => {
  it('talent: enforces wireframe caps (500-char bio, 5 portfolio images)', () => {
    expect(TalentProfileUpdateSchema.safeParse({ bio: 'x'.repeat(501) }).success).toBe(false);
    expect(
      TalentProfileUpdateSchema.safeParse({ portfolio_images: Array(6).fill('data:1') }).success
    ).toBe(false);
    expect(
      TalentProfileUpdateSchema.safeParse({ bio: 'x'.repeat(500), portfolio_images: [] }).success
    ).toBe(true);
  });

  it('talent: strips unknown keys like profile_completion_pct/user_id (server-computed)', () => {
    const parsed = TalentProfileUpdateSchema.parse({
      stage_name: 'DJ Test',
      profile_completion_pct: 100,
      user_id: 'someone-else',
    });
    expect(parsed).toEqual({ stage_name: 'DJ Test' });
  });

  it('settings: validates recovery email but allows clearing with empty string', () => {
    expect(SettingsUpdateSchema.safeParse({ recovery_email: 'not-an-email' }).success).toBe(false);
    expect(SettingsUpdateSchema.parse({ recovery_email: '' }).recovery_email).toBe('');
    expect(SettingsUpdateSchema.parse({ recovery_email: 'a@b.co' }).recovery_email).toBe('a@b.co');
  });

  it('settings: validates phone shape and allows clearing', () => {
    expect(SettingsUpdateSchema.safeParse({ phone: 'letters' }).success).toBe(false);
    expect(SettingsUpdateSchema.safeParse({ phone: '+1 (212) 555-0100' }).success).toBe(true);
    expect(SettingsUpdateSchema.safeParse({ phone: '' }).success).toBe(true);
  });

  it('change-password: enforces min length and difference from current', () => {
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: 'old-pass-1', newPassword: 'short' })
        .success
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: 'same-pass-123', newPassword: 'same-pass-123' })
        .success
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' })
        .success
    ).toBe(true);
  });
});

describe('TwoFactorActionSchema', () => {
  it('enable requires base32 secret + 6-digit token', () => {
    expect(
      TwoFactorActionSchema.safeParse({
        action: 'enable',
        secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        token: '123456',
      }).success
    ).toBe(true);
    expect(
      TwoFactorActionSchema.safeParse({ action: 'enable', secret: 'not base32!!', token: '123456' })
        .success
    ).toBe(false);
    expect(
      TwoFactorActionSchema.safeParse({
        action: 'enable',
        secret: 'GEZDGNBVGY3TQOJQ',
        token: '12345',
      }).success
    ).toBe(false);
  });

  it('disable requires only the token; unknown actions rejected', () => {
    expect(TwoFactorActionSchema.safeParse({ action: 'disable', token: '654321' }).success).toBe(
      true
    );
    expect(TwoFactorActionSchema.safeParse({ action: 'reset', token: '654321' }).success).toBe(
      false
    );
    expect(TwoFactorActionSchema.safeParse({ action: 'disable' }).success).toBe(false);
  });
});
