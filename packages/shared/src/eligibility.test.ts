import { describe, expect, it } from 'vitest';
import { canBorrow, computeEligibility, isTermEnded, type EligibilityInput } from './eligibility';

const athlete: EligibilityInput = { kind: 'ATHLETE', onScholarship: true, staffActive: true, inTerm: true, termEnded: false };
const staff: EligibilityInput = { kind: 'STAFF', onScholarship: false, staffActive: true, inTerm: false, termEnded: false };

describe('athletes', () => {
  it('need the term tag, an open term and a scholarship, then borrow books and tech', () => {
    expect(computeEligibility(athlete)).toBe('ELIGIBLE');
    expect(canBorrow('ELIGIBLE', 'book')).toBe(true);
    expect(canBorrow('ELIGIBLE', 'tech')).toBe(true);
  });
  it('without a scholarship, a tag or an open term they borrow nothing', () => {
    expect(computeEligibility({ ...athlete, onScholarship: false })).toBe('NO_SCHOLARSHIP');
    expect(computeEligibility({ ...athlete, inTerm: false })).toBe('NOT_IN_TERM');
    expect(computeEligibility({ ...athlete, termEnded: true })).toBe('TERM_ENDED');
    expect(computeEligibility({ ...athlete, onScholarship: false, termEnded: true })).toBe('TERM_ENDED');
    for (const s of ['NO_SCHOLARSHIP', 'NOT_IN_TERM', 'TERM_ENDED'] as const) {
      expect(canBorrow(s, 'book') || canBorrow(s, 'tech')).toBe(false);
    }
  });
  it('the staff switch means nothing for an athlete', () => {
    expect(computeEligibility({ ...athlete, staffActive: false })).toBe('ELIGIBLE');
  });
});

describe('graduate assistants', () => {
  it('are students, not staff: term tag, open term and scholarship, then books and tech', () => {
    const ga: EligibilityInput = { ...athlete, kind: 'GRAD_ASSISTANT' };
    expect(computeEligibility(ga)).toBe('ELIGIBLE');
    expect(computeEligibility({ ...ga, onScholarship: false })).toBe('NO_SCHOLARSHIP');
    expect(computeEligibility({ ...ga, inTerm: false })).toBe('NOT_IN_TERM');
    expect(computeEligibility({ ...ga, termEnded: true })).toBe('TERM_ENDED');
  });
});

describe('staff', () => {
  it('borrow tech only, never books, while active', () => {
    expect(computeEligibility(staff)).toBe('TECH_ONLY');
    expect(canBorrow('TECH_ONLY', 'tech')).toBe(true);
    expect(canBorrow('TECH_ONLY', 'book')).toBe(false);
  });
  it('ignore term tags, deadlines and the scholarship flag', () => {
    expect(computeEligibility({ ...staff, inTerm: true, termEnded: true, onScholarship: true })).toBe('TECH_ONLY');
  });
  it('borrow nothing once an admin switches them off', () => {
    expect(computeEligibility({ ...staff, staffActive: false })).toBe('STAFF_INACTIVE');
    expect(canBorrow('STAFF_INACTIVE', 'tech')).toBe(false);
  });
});

describe('isTermEnded', () => {
  it('the deadline day itself is still open; the day after is over', () => {
    expect(isTermEnded('2026-12-16', '2026-12-15')).toBe(false);
    expect(isTermEnded('2026-12-16', '2026-12-16')).toBe(false);
    expect(isTermEnded('2026-12-16', '2026-12-17')).toBe(true);
  });
});
