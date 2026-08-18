import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Stored-XSS structural gate (S15, OWASP A03). User content (bios, gig
 * descriptions, messages, review comments) renders as plain JSX text
 * everywhere — React escapes it. The one way to defeat that is
 * `dangerouslySetInnerHTML`, so this suite bans it outside a reviewed
 * allowlist and proves the allowlisted sinks are static-CSS `<style>`
 * injections, not HTML containers.
 *
 * Layered with: the manual stored-XSS probes (TESTING.md §10 #5), the ZAP
 * baseline (S15, passive scan on every PR), and the behavioral render test
 * that landed with the S17 component harness (MessagesView.test.tsx: hostile
 * message content renders as inert text).
 */

const SRC_ROOT = join(__dirname, '..', 'src');

/** Reviewed sinks. Every entry must be a `<style>` element with dev-authored CSS. */
const ALLOWED_SINKS: Record<string, string> = {
  'app/page.tsx': 'landing bounce keyframes — hardcoded CSS string literal, zero interpolation of data',
  'components/ui/chart.tsx':
    'shadcn chart theme CSS — generated from the developer\u2019s chart config (code, not user data)',
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

const files = walk(SRC_ROOT).map((file) => ({
  key: relative(SRC_ROOT, file).split('\\').join('/'),
  text: readFileSync(file, 'utf8'),
}));

describe('stored-XSS structural gate (S15)', () => {
  it('dangerouslySetInnerHTML appears ONLY in the reviewed allowlist', () => {
    const offenders = files
      .filter(({ text }) => text.includes('dangerouslySetInnerHTML'))
      .filter(({ key }) => !(key in ALLOWED_SINKS))
      .map(({ key }) => key);
    expect(
      offenders,
      'New dangerouslySetInnerHTML sink. User content must render as plain JSX text; ' +
        'if this sink is genuinely static, add it to ALLOWED_SINKS with its justification.'
    ).toEqual([]);
  });

  it('every allowlisted sink still exists (no stale rows)', () => {
    const withSink = new Set(
      files.filter(({ text }) => text.includes('dangerouslySetInnerHTML')).map(({ key }) => key)
    );
    const stale = Object.keys(ALLOWED_SINKS).filter((key) => !withSink.has(key));
    expect(stale).toEqual([]);
  });

  it('allowlisted sinks are <style> elements, never HTML containers', () => {
    for (const key of Object.keys(ALLOWED_SINKS)) {
      const file = files.find((f) => f.key === key);
      expect(file, key).toBeDefined();
      const text = file!.text;
      let searchFrom = 0;
      let index = text.indexOf('dangerouslySetInnerHTML');
      while (index !== -1) {
        // The nearest preceding JSX opening tag must be <style ...>.
        const before = text.slice(Math.max(0, index - 400), index);
        const lastOpen = before.lastIndexOf('<');
        expect(
          before.slice(lastOpen),
          `${key}: dangerouslySetInnerHTML on a non-<style> element`
        ).toMatch(/^<style\b/);
        searchFrom = index + 1;
        index = text.indexOf('dangerouslySetInnerHTML', searchFrom);
      }
    }
  });

  it('no direct innerHTML / document.write anywhere in src', () => {
    const offenders = files
      .filter(({ text }) => /\.innerHTML\s*=|document\.write\(/.test(text))
      .map(({ key }) => key);
    expect(offenders).toEqual([]);
  });
});
