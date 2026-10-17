import { describe, expect, it } from 'vitest';
import { computeEligibility } from './eligibility';

describe('computeEligibility', () => {
  it('an athlete needs the term tag and a scholarship', () => {
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: true, inTerm: true })).toBe('ELIGIBLE');
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: false, inTerm: true })).toBe('NO_SCHOLARSHIP');
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: true, inTerm: false })).toBe('NOT_IN_TERM');
  });
  it('no tag always means not in the term, whatever the scholarship says', () => {
    expect(computeEligibility({ kind: 'ATHLETE', onScholarship: false, inTerm: false })).toBe('NOT_IN_TERM');
    expect(computeEligibility({ kind: 'STAFF', onScholarship: true, inTerm: false })).toBe('NOT_IN_TERM');
  });
  it('staff and graduate assistants only need the tag; the scholarship flag is ignored', () => {
    expect(computeEligibility({ kind: 'STAFF', onScholarship: false, inTerm: true })).toBe('ELIGIBLE');
    expect(computeEligibility({ kind: 'GRAD_ASSISTANT', onScholarship: false, inTerm: true })).toBe('ELIGIBLE');
  });
});
