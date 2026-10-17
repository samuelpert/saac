import { describe, expect, it } from 'vitest';
import { computeEligibility, isTermEnded } from './eligibility';

const base = { inTerm: true, termEnded: false };

describe('computeEligibility', () => {
  it('an athlete needs the term tag and a scholarship while the term is open', () => {
    expect(computeEligibility({ ...base, kind: 'ATHLETE', onScholarship: true })).toBe('ELIGIBLE');
    expect(computeEligibility({ ...base, kind: 'ATHLETE', onScholarship: false })).toBe('NO_SCHOLARSHIP');
  });
  it('no tag always means not in the term, whatever else is true', () => {
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: true, inTerm: false, termEnded: false })).toBe('NOT_IN_TERM');
    expect(computeEligibility({ kind: 'STAFF', onScholarship: true, inTerm: false, termEnded: true })).toBe('NOT_IN_TERM');
  });
  it('after the return deadline nobody can borrow, scholarship or not', () => {
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: true, inTerm: true, termEnded: true })).toBe('TERM_ENDED');
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: false, inTerm: true, termEnded: true })).toBe('TERM_ENDED');
    expect(computeEligibility({ kind: 'STAFF', onScholarship: false, inTerm: true, termEnded: true })).toBe('TERM_ENDED');
  });
  it('staff and graduate assistants only need the tag; the scholarship flag is ignored', () => {
    expect(computeEligibility({ ...base, kind: 'STAFF', onScholarship: false })).toBe('ELIGIBLE');
    expect(computeEligibility({ ...base, kind: 'GRAD_ASSISTANT', onScholarship: false })).toBe('ELIGIBLE');
  });
});

describe('isTermEnded', () => {
  it('the deadline day itself is still open; the day after is over', () => {
    expect(isTermEnded('2026-12-16', '2026-12-15')).toBe(false);
    expect(isTermEnded('2026-12-16', '2026-12-16')).toBe(false);
    expect(isTermEnded('2026-12-16', '2026-12-17')).toBe(true);
  });
});
