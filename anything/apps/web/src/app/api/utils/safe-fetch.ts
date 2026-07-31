/**
 * A10 SSRF guard (S10 security gate) — the ONLY sanctioned way for this app
 * to fetch a URL influenced by user input. Geocoding (S10) is the first
 * consumer; the parked calendar/ticketing integrations (#2) must reuse it.
 *
 * Defenses, in order:
 *  1. HTTPS only, and the hostname must be on the caller's explicit
 *     allowlist — deny by default, no wildcard support.
 *  2. IP-literal hosts are rejected outright; the allowlisted hostname is
 *     resolved and every resolved address must be public (private, loopback,
 *     link-local, CGN, and IPv6 unique-local/link-local/mapped ranges deny).
 *  3. Redirects are NOT followed — a redirect is an error (an allowlisted
 *     host redirecting into an internal address is the classic bypass).
 *  4. Hard timeout via AbortController, and a response size cap.
 *
 * Residual risk, documented: Node's fetch re-resolves DNS at connect time,
 * so a malicious allowlisted host could rebind between our check and the
 * connection (TOCTOU). Accepted for alpha because the allowlist is a short
 * list of reputable services we choose; pinning resolved IPs needs a custom
 * undici Agent and is the noted hardening step if the allowlist ever grows.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApiError } from './route-kit';

export interface SafeFetchOptions {
  /** Exact hostnames that may be contacted. Deny-by-default. */
  allowedHosts: string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
}

/** True when the address belongs to a range that must never be dialed. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // CGN 100.64/10
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
    if (a === 192 && b === 168) return true; // private 192.168/16
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true; // unspecified, loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped — judge the embedded IPv4.
      return isPrivateAddress(lower.slice('::ffff:'.length));
    }
    return false;
  }
  // Not an IP at all — callers resolve first; treat unknown as unsafe.
  return true;
}

/**
 * Fetch `url` under the guard. Throws ApiError(400/502) on any violation;
 * returns the parsed text body (bounded).
 */
export async function safeFetch(url: string, options: SafeFetchOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxBytes = options.maxResponseBytes ?? 1_000_000;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw ApiError.badRequest('Invalid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw ApiError.badRequest('Only https URLs may be fetched');
  }
  if (parsed.username || parsed.password) {
    throw ApiError.badRequest('Credentials in URLs are not allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (!options.allowedHosts.includes(host)) {
    throw ApiError.badRequest(`Host not allowlisted: ${host}`);
  }
  // Allowlist entries are DNS names we chose; an IP literal never qualifies.
  if (isIP(host) !== 0) {
    throw ApiError.badRequest('IP-literal hosts are not allowed');
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ApiError(502, `Could not resolve ${host}`);
  }
  if (resolved.length === 0 || resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new ApiError(502, 'Refusing to contact a non-public address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: options.headers,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new ApiError(502, 'Upstream redirected — refusing to follow');
    }
    if (!response.ok) {
      throw new ApiError(502, `Upstream answered ${response.status}`);
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new ApiError(502, 'Upstream response too large');
    }
    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Upstream fetch failed');
  } finally {
    clearTimeout(timer);
  }
}
