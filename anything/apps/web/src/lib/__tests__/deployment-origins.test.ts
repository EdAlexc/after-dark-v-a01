import { describe, expect, it } from 'vitest';
import { vercelOrigins } from '../deployment-origins';

describe('vercelOrigins', () => {
  it('returns nothing off-platform, so non-Vercel envs are unaffected', () => {
    expect(vercelOrigins({})).toEqual([]);
    expect(vercelOrigins({ VERCEL_URL: '' })).toEqual([]);
  });

  it('trusts the unique preview URL of the current deployment', () => {
    expect(vercelOrigins({ VERCEL_URL: 'afterdark-abc123-team.vercel.app' })).toEqual([
      'https://afterdark-abc123-team.vercel.app',
    ]);
  });

  it('trusts the deployment, branch alias and production hostnames together', () => {
    expect(
      vercelOrigins({
        VERCEL_URL: 'afterdark-abc123-team.vercel.app',
        VERCEL_BRANCH_URL: 'afterdark-git-feat-team.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'afterdark.com',
      }),
    ).toEqual([
      'https://afterdark-abc123-team.vercel.app',
      'https://afterdark-git-feat-team.vercel.app',
      'https://afterdark.com',
    ]);
  });

  it('dedupes when production and deployment hostnames coincide', () => {
    expect(
      vercelOrigins({
        VERCEL_URL: 'afterdark.com',
        VERCEL_PROJECT_PRODUCTION_URL: 'afterdark.com',
      }),
    ).toEqual(['https://afterdark.com']);
  });

  it('does not double-prefix a value that already carries a scheme', () => {
    expect(vercelOrigins({ VERCEL_URL: 'https://afterdark.com' })).toEqual([
      'https://afterdark.com',
    ]);
  });

  it('never emits a wildcard that would trust unrelated vercel.app apps', () => {
    const origins = vercelOrigins({
      VERCEL_URL: 'afterdark-abc123-team.vercel.app',
      VERCEL_BRANCH_URL: 'afterdark-git-feat-team.vercel.app',
    });
    expect(origins.some((origin) => origin.includes('*'))).toBe(false);
  });
});
