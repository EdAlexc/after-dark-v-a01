/**
 * P10.1 wiring tests: the manifest is valid and complete, every icon it
 * references is committed, and the layout/registration plumbing points at the
 * right files — so a broken install surface fails CI, not an alpha tester.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..');
const publicDir = path.join(webRoot, 'public');

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };
const manifest = JSON.parse(
	readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
) as {
	name: string;
	short_name: string;
	id: string;
	start_url: string;
	scope: string;
	display: string;
	background_color: string;
	theme_color: string;
	icons: ManifestIcon[];
};

describe('manifest.webmanifest (P10.1)', () => {
	it('declares the installable-app basics on the PRD palette', () => {
		expect(manifest.name).toContain('AfterDark');
		expect(manifest.short_name).toBe('AfterDark');
		expect(manifest.start_url).toBe('/');
		expect(manifest.scope).toBe('/');
		expect(manifest.display).toBe('standalone');
		expect(manifest.theme_color).toBe('#121212');
		expect(manifest.background_color).toBe('#121212');
	});

	it('ships 192 + 512 icons including a maskable purpose', () => {
		const sizes = manifest.icons.map((icon) => icon.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
	});

	it('every referenced icon file is committed', () => {
		for (const icon of manifest.icons) {
			expect(existsSync(path.join(publicDir, icon.src)), `${icon.src} missing`).toBe(true);
		}
		expect(existsSync(path.join(publicDir, 'icons', 'apple-touch-icon.png'))).toBe(true);
	});
});

describe('PWA wiring', () => {
	it('the root layout links the manifest, apple icon, and theme color', () => {
		const layout = readFileSync(path.join(webRoot, 'src', 'app', 'layout.tsx'), 'utf8');
		expect(layout).toContain('/manifest.webmanifest');
		expect(layout).toContain('/icons/apple-touch-icon.png');
		expect(layout).toContain('#121212');
	});

	it('the registered worker and its offline fallback exist in public/', () => {
		expect(existsSync(path.join(publicDir, 'sw.js'))).toBe(true);
		expect(existsSync(path.join(publicDir, 'offline.html'))).toBe(true);
		const pwa = readFileSync(path.join(webRoot, 'src', 'lib', 'pwa.ts'), 'utf8');
		expect(pwa).toContain("register('/sw.js')");
	});

	it('the offline fallback is script-free (it is served without a nonce)', () => {
		const offline = readFileSync(path.join(publicDir, 'offline.html'), 'utf8');
		expect(offline).not.toMatch(/<script/i);
	});
});
