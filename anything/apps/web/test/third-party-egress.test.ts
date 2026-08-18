import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Third-party egress gate (S15, G11 / OWASP A08).
 *
 * ZAP's first baseline run surfaced two first-party-looking third-party
 * dependencies that had survived since the create.xyz export:
 *
 *  - a FontAwesome Pro stylesheet `<link>` in the root layout, proxied
 *    through a `/fontawesome/*` → ka-p.fontawesome.com rewrite (so it read
 *    as same-origin and the CSP never questioned it) — with ZERO `fa-`
 *    usage anywhere in src, and its webfonts already blocked by
 *    `font-src 'self' data:`. It leaked every visitor's IP + a kit token
 *    in the URL, and ZAP flagged the proxied response's
 *    `access-control-allow-origin: *`;
 *  - a landing-page background texture hotlinked from
 *    transparenttextures.com, which ALSO would have gone dark the moment
 *    B5 set the Blob token (the pinned img-src excludes it).
 *
 * Both are gone. This keeps them gone: no browser-reachable asset URL in
 * app code may point off-origin.
 */

const SRC_ROOT = join(__dirname, '..', 'src');

/** Origins allowed in app source, each for a stated reason. */
const ALLOWED_ORIGINS: Record<string, string> = {
  'https://tile.openstreetmap.org': 'S10 map raster tiles — keyless by design, pinned in CSP img-src/connect-src',
  'https://api.resend.com': 'S13 transactional email — server-side fetch only, never a browser asset',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * URLs the browser FETCHES: `src=` (script/img/iframe), CSS `url(…)`, and
 * `href` only on `<link>` (stylesheets/preloads). An `<a href>` is
 * navigation, not egress — nothing is requested until a user clicks, and
 * the OSM tile licence positively requires such an attribution link.
 */
const ASSET_URL = /(?:src=|url\()\s*["'{]?\s*(https?:\/\/[^"')\s]+)/g;
const LINK_TAG_HREF = /<link\b[^>]*?href=\s*["'{]?\s*(https?:\/\/[^"')\s]+)/gis;

describe('third-party egress (S15)', () => {
  const files = walk(SRC_ROOT).map((file) => ({
    key: relative(SRC_ROOT, file).split('\\').join('/'),
    text: readFileSync(file, 'utf8'),
  }));

  it('no app asset (href/src/url) points at an unapproved off-origin host', () => {
    const offenders: string[] = [];
    for (const { key, text } of files) {
      for (const pattern of [ASSET_URL, LINK_TAG_HREF]) {
        for (const match of text.matchAll(pattern)) {
          const url = match[1];
          const origin = (/^https?:\/\/[^/]+/.exec(url) ?? [''])[0];
          if (!(origin in ALLOWED_ORIGINS)) offenders.push(`${key}: ${url}`);
        }
      }
    }
    expect(
      offenders,
      'Third-party asset URL in app code. Self-host it (public/), or add its origin to ' +
        'ALLOWED_ORIGINS with the reason AND to the CSP — a first-party-looking rewrite is ' +
        'not an exemption, it is how the FontAwesome leak hid for so long.'
    ).toEqual([]);
  });

  it('FontAwesome is gone — no link, no proxy rewrite, no usage', () => {
    const config = readFileSync(join(__dirname, '..', 'next.config.js'), 'utf8');
    expect(config).not.toContain('fontawesome');
    for (const { key, text } of files) {
      expect(text.toLowerCase(), key).not.toContain('fontawesome');
    }
  });

  it('next.config declares no rewrite to an off-origin destination', () => {
    const config = readFileSync(join(__dirname, '..', 'next.config.js'), 'utf8');
    const destinations = [...config.matchAll(/destination:\s*['"`](https?:\/\/[^'"`]+)/g)].map(
      (m) => m[1]
    );
    expect(destinations).toEqual([]);
  });
});
