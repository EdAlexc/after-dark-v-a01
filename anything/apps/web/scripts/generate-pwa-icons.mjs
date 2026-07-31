/**
 * Generate the PWA icon set (P10.1) into public/icons/.
 *
 * Deterministic vector art rendered with sharp (already a P4 dependency), so
 * the committed PNGs are reproducible: `yarn pwa:icons`. Pure shapes — no
 * fonts — to render identically on any machine.
 *
 * Mark: neon-cyan crescent moon + star on the #121212 ground (PRD §5 palette).
 * - icon-*.png: rounded-square tile (purpose "any").
 * - maskable-*.png: full-bleed square with the mark inside the ~80% safe zone
 *   (purpose "maskable" — the platform applies its own mask).
 * - apple-touch-icon.png: 180px full-bleed square (iOS rounds it itself).
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = '#121212';
const NEON = '#00FFCC';

/**
 * 512-viewBox artwork. `rounded` draws the tile with rounded corners;
 * `scale` shrinks the mark around the center (maskable safe zone).
 */
function iconSvg({ rounded, scale = 1 }) {
	const r = rounded ? 116 : 0;
	const center = 256;
	const group = `translate(${center} ${center}) scale(${scale}) translate(${-center} ${-center})`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<rect width="512" height="512" rx="${r}" fill="${BG}"/>
	<g transform="${group}">
		<!-- crescent: neon disc with a bg disc knocked out of its upper right -->
		<circle cx="248" cy="264" r="150" fill="${NEON}"/>
		<circle cx="312" cy="212" r="132" fill="${BG}"/>
		<!-- star, floating in the crescent's hollow -->
		<circle cx="368" cy="188" r="22" fill="${NEON}"/>
	</g>
</svg>`;
}

async function render(svg, size, file) {
	await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT_DIR, file));
	console.log(`✓ ${file} (${size}px)`);
}

await mkdir(OUT_DIR, { recursive: true });

const tile = iconSvg({ rounded: true });
const maskable = iconSvg({ rounded: false, scale: 0.72 });
const fullBleed = iconSvg({ rounded: false });

await render(tile, 192, 'icon-192.png');
await render(tile, 512, 'icon-512.png');
await render(maskable, 192, 'maskable-192.png');
await render(maskable, 512, 'maskable-512.png');
await render(fullBleed, 180, 'apple-touch-icon.png');
