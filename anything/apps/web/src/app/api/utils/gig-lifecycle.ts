/**
 * Gig status lifecycle (P1.3): DRAFT → PUBLISHED → FILLED → COMPLETED,
 * with CANCELLED reachable from every non-terminal state and the two
 * "undo" edges venues actually need (unpublish, reopen a filled slot).
 *
 * Pure module so the transition matrix is unit-testable; the PATCH route
 * enforces it server-side (never trust client state).
 */

import type { GigStatus } from './schemas';

export const GIG_STATUSES: readonly GigStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'FILLED',
  'COMPLETED',
  'CANCELLED',
];

export const GIG_TRANSITIONS: Record<GigStatus, readonly GigStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['DRAFT', 'FILLED', 'CANCELLED'],
  FILLED: ['PUBLISHED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: GigStatus, to: GigStatus): boolean {
  return (GIG_TRANSITIONS[from] ?? []).includes(to);
}
