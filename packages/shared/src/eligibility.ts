import type { BorrowerKind } from './schemas';

/**
 * Whether a person may borrow in a term. This is the one definition: the dashboard, the lists,
 * the person page and (phase 4) the checkout service all use it.
 *
 * - NOT_IN_TERM: no tag for the term.
 * - NO_SCHOLARSHIP: tagged, but an athlete who is not on scholarship.
 * - ELIGIBLE: tagged, and either on scholarship or not an athlete.
 *
 * The scholarship rule applies to athletes only. Staff and graduate assistants have no scholarship
 * (the real file marks some staff rows as on scholarship, which looks like a data slip), so a staff
 * tag alone makes them eligible.
 */
export type Eligibility = 'ELIGIBLE' | 'NO_SCHOLARSHIP' | 'NOT_IN_TERM';

export function computeEligibility(p: { kind: BorrowerKind; onScholarship: boolean; inTerm: boolean }): Eligibility {
  if (!p.inTerm) return 'NOT_IN_TERM';
  if (p.kind === 'ATHLETE' && !p.onScholarship) return 'NO_SCHOLARSHIP';
  return 'ELIGIBLE';
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  ELIGIBLE: 'Can borrow',
  NO_SCHOLARSHIP: 'Not on scholarship',
  NOT_IN_TERM: 'Not in this term',
};
