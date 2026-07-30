/** Types for the shared CJS security-headers module. */

export interface CspOptions {
  isDev?: boolean;
  env?: Record<string, string | undefined>;
  nonce?: string;
}

export function buildCsp(options?: CspOptions): string;
export function buildSecurityHeaders(
  options?: CspOptions
): Array<{ key: string; value: string }>;
export function createPlatformOrigins(env: Record<string, string | undefined>): string[];
