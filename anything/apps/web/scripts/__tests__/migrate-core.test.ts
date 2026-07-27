import { describe, expect, it } from 'vitest';
// Plain .mjs module shared with the runner script.
import { isValidMigrationName, selectPending } from '../migrate-core.mjs';

describe('isValidMigrationName', () => {
  it.each(['0001_baseline.sql', '0002_audit_logs.sql', '9999_zz_9.sql'])('accepts %s', (name) => {
    expect(isValidMigrationName(name)).toBe(true);
  });

  it.each([
    '1_short_prefix.sql',
    '0001-dashes.sql',
    '0001_Upper.sql',
    '0001_no_extension',
    '0001_.sql.bak',
    'baseline.sql',
    '0001_spaces here.sql',
  ])('rejects %s', (name) => {
    expect(isValidMigrationName(name)).toBe(false);
  });
});

describe('selectPending', () => {
  it('returns everything when nothing is applied, in numeric order', () => {
    expect(selectPending(['0002_b.sql', '0001_a.sql', '0010_j.sql'], [])).toEqual([
      '0001_a.sql',
      '0002_b.sql',
      '0010_j.sql',
    ]);
  });

  it('skips applied migrations', () => {
    expect(selectPending(['0001_a.sql', '0002_b.sql'], ['0001_a.sql'])).toEqual(['0002_b.sql']);
  });

  it('returns empty when fully applied', () => {
    expect(selectPending(['0001_a.sql'], ['0001_a.sql'])).toEqual([]);
    expect(selectPending([], [])).toEqual([]);
  });

  it('throws when an applied migration file was deleted (history rewrite guard)', () => {
    expect(() => selectPending(['0002_b.sql'], ['0001_a.sql'])).toThrow(/never delete/);
  });

  it('throws on invalid filenames instead of silently skipping them', () => {
    expect(() => selectPending(['0001_a.sql', 'rogue.sql'], [])).toThrow(/Invalid migration/);
  });
});
