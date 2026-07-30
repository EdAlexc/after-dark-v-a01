import { describe, expect, it } from 'vitest';
import { GIG_STATUSES, GIG_TRANSITIONS, canTransition } from '../gig-lifecycle';

describe('gig lifecycle transitions', () => {
  it('covers every status exactly once', () => {
    expect(Object.keys(GIG_TRANSITIONS).sort()).toEqual([...GIG_STATUSES].sort());
  });

  it('allows the happy path DRAFT → PUBLISHED → FILLED → COMPLETED', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransition('PUBLISHED', 'FILLED')).toBe(true);
    expect(canTransition('FILLED', 'COMPLETED')).toBe(true);
  });

  it('allows cancel from every non-terminal state and the undo edges', () => {
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('PUBLISHED', 'CANCELLED')).toBe(true);
    expect(canTransition('FILLED', 'CANCELLED')).toBe(true);
    expect(canTransition('PUBLISHED', 'DRAFT')).toBe(true); // unpublish
    expect(canTransition('FILLED', 'PUBLISHED')).toBe(true); // reopen
  });

  it('makes COMPLETED and CANCELLED terminal', () => {
    for (const to of GIG_STATUSES) {
      expect(canTransition('COMPLETED', to)).toBe(false);
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('blocks skipping states', () => {
    expect(canTransition('DRAFT', 'FILLED')).toBe(false);
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransition('PUBLISHED', 'COMPLETED')).toBe(false);
    expect(canTransition('COMPLETED', 'PUBLISHED')).toBe(false);
  });
});
