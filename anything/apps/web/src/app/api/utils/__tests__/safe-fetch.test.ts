/**
 * A10 SSRF guard (S10) — the defenses as executable spec. This is the only
 * sanctioned path for fetching user-influenced URLs; the parked #2
 * integrations inherit these exact properties.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  lookup: mocks.lookup,
  default: { lookup: mocks.lookup },
}));

import { isPrivateAddress, safeFetch } from '../safe-fetch';

const ALLOW = { allowedHosts: ['api.example.com'] };
const realFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34' }]);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => 'ok-body',
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('isPrivateAddress', () => {
  it('denies every internal/reserved range', () => {
    for (const address of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata — the classic SSRF target
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12::1',
      '::ffff:10.0.0.1',
      '::ffff:127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe('safeFetch', () => {
  it('deny-by-default: hosts off the allowlist never resolve or connect', async () => {
    await expect(safeFetch('https://evil.example.com/x', ALLOW)).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses plain http and credentialed URLs', async () => {
    await expect(safeFetch('http://api.example.com/x', ALLOW)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      safeFetch('https://user:pass@api.example.com/x', ALLOW)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses IP-literal hosts even when someone allowlists one', async () => {
    await expect(
      safeFetch('https://169.254.169.254/latest', { allowedHosts: ['169.254.169.254'] })
    ).rejects.toMatchObject({ status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses when DNS resolves into a private range (rebound allowlisted host)', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34' },
      { address: '10.0.0.5' }, // one private A-record poisons the set
    ]);
    await expect(safeFetch('https://api.example.com/x', ALLOW)).rejects.toMatchObject({
      status: 502,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('treats redirects as errors — never follows', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 302,
      text: async () => '',
    });
    await expect(safeFetch('https://api.example.com/x', ALLOW)).rejects.toMatchObject({
      status: 502,
    });
    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe('manual');
  });

  it('caps the response size', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'x'.repeat(2000),
    });
    await expect(
      safeFetch('https://api.example.com/x', { ...ALLOW, maxResponseBytes: 1000 })
    ).rejects.toMatchObject({ status: 502 });
  });

  it('aborts on timeout and maps the failure to 502', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    await expect(
      safeFetch('https://api.example.com/slow', { ...ALLOW, timeoutMs: 20 })
    ).rejects.toMatchObject({ status: 502 });
  });

  it('returns the body for a clean allowlisted fetch', async () => {
    await expect(safeFetch('https://api.example.com/x', ALLOW)).resolves.toBe('ok-body');
  });
});
