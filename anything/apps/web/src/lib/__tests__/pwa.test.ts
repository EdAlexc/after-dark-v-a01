/**
 * Unit tests for the PWA client lifecycle (P10.2): production-gated
 * registration and the §6.6 logout purge.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { purgeSwCaches, registerServiceWorker } from '../pwa';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('registerServiceWorker', () => {
	it('registers /sw.js in production', () => {
		const register = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { serviceWorker: { register } });
		vi.stubEnv('NODE_ENV', 'production');
		registerServiceWorker();
		expect(register).toHaveBeenCalledWith('/sw.js');
	});

	it('does nothing outside production (dev HMR conflicts)', () => {
		const register = vi.fn();
		vi.stubGlobal('navigator', { serviceWorker: { register } });
		registerServiceWorker();
		expect(register).not.toHaveBeenCalled();
	});

	it('is a silent no-op without serviceWorker support', () => {
		vi.stubGlobal('navigator', {});
		vi.stubEnv('NODE_ENV', 'production');
		expect(() => registerServiceWorker()).not.toThrow();
	});

	it('swallows registration failures (progressive enhancement)', async () => {
		const register = vi.fn().mockRejectedValue(new Error('blocked'));
		vi.stubGlobal('navigator', { serviceWorker: { register } });
		vi.stubEnv('NODE_ENV', 'production');
		registerServiceWorker();
		// A rejection here would surface as an unhandled rejection and fail the run.
		await vi.waitFor(() => expect(register).toHaveBeenCalled());
	});
});

describe('purgeSwCaches (§6.6 logout purge)', () => {
	it('deletes every cache and notifies the controlling worker', async () => {
		const deleted: string[] = [];
		vi.stubGlobal('caches', {
			keys: vi.fn().mockResolvedValue(['afterdark-precache-v1', 'afterdark-static-v1']),
			delete: vi.fn().mockImplementation(async (key: string) => {
				deleted.push(key);
				return true;
			}),
		});
		const postMessage = vi.fn();
		vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage } } });
		await purgeSwCaches();
		expect(deleted.sort()).toEqual(['afterdark-precache-v1', 'afterdark-static-v1']);
		expect(postMessage).toHaveBeenCalledWith({ type: 'PURGE_CACHES' });
	});

	it('resolves quietly when Cache Storage is unavailable', async () => {
		vi.stubGlobal('caches', undefined);
		await expect(purgeSwCaches()).resolves.toBeUndefined();
	});

	it('never lets a purge failure block logout', async () => {
		vi.stubGlobal('caches', {
			keys: vi.fn().mockRejectedValue(new Error('storage broken')),
			delete: vi.fn(),
		});
		await expect(purgeSwCaches()).resolves.toBeUndefined();
	});

	it('purges even when no worker controls the page yet', async () => {
		const cachesDelete = vi.fn().mockResolvedValue(true);
		vi.stubGlobal('caches', {
			keys: vi.fn().mockResolvedValue(['afterdark-precache-v1']),
			delete: cachesDelete,
		});
		vi.stubGlobal('navigator', { serviceWorker: {} });
		await purgeSwCaches();
		expect(cachesDelete).toHaveBeenCalledWith('afterdark-precache-v1');
	});
});
