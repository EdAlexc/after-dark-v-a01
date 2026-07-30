/**
 * Application status lifecycle (P3) — same pure-matrix pattern as
 * gig-lifecycle.ts, but transitions are **actor-scoped**: who you are decides
 * which edges exist. The route enforces this server-side; the UI only mirrors.
 *
 *   PENDING ──venue──► SHORTLISTED ──venue──► HIRED
 *      │                    │                   (terminal here; shift takes over)
 *      ├──venue──► REJECTED ◄──venue──┘
 *      └──talent─► WITHDRAWN (also from SHORTLISTED)
 */

export type ApplicationStatus =
  | 'PENDING'
  | 'SHORTLISTED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type ApplicationActor = 'TALENT' | 'VENUE';

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'PENDING',
  'SHORTLISTED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
];

const VENUE_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  PENDING: ['SHORTLISTED', 'HIRED', 'REJECTED'],
  SHORTLISTED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: ['SHORTLISTED'], // un-reject: recover from a mis-click before the talent sees it
  WITHDRAWN: [],
};

const TALENT_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  PENDING: ['WITHDRAWN'],
  SHORTLISTED: ['WITHDRAWN'],
  HIRED: [], // withdrawing after hire is a shift cancellation, not an application edit
  REJECTED: [],
  WITHDRAWN: [],
};

export function canTransitionApplication(
  actor: ApplicationActor,
  from: ApplicationStatus,
  to: ApplicationStatus
): boolean {
  const table = actor === 'VENUE' ? VENUE_TRANSITIONS : TALENT_TRANSITIONS;
  return (table[from] ?? []).includes(to);
}

export function allowedApplicationTransitions(
  actor: ApplicationActor,
  from: ApplicationStatus
): readonly ApplicationStatus[] {
  return (actor === 'VENUE' ? VENUE_TRANSITIONS : TALENT_TRANSITIONS)[from] ?? [];
}
