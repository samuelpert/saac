import type { BorrowerKind } from './schemas';

/**
 * Whether a person may borrow in a term. This is the one definition: the dashboard, the lists,
 * the person page and (phase 4) the checkout service all use it.
 *
 * - NOT_IN_TERM: no tag for the term.
 * - TERM_ENDED: tagged, but the term's return deadline has passed. Scholarship does not carry over:
 *   from the day after the deadline nobody can borrow until the next term's list is imported.
 * - NO_SCHOLARSHIP: tagged and the term is open, but an athlete who is not on scholarship.
 * - ELIGIBLE: tagged, the term is open, and either on scholarship or not an athlete.
 *
 * The scholarship rule applies to athletes only. Staff and graduate assistants have no scholarship
 * (the real file marks some staff rows as on scholarship, which looks like a data slip), so a staff
 * tag alone makes them eligible while the term is open.
 *
 * Returning items is never blocked by this. Overdue items still have to come back after the deadline.
 */
export type Eligibility = 'ELIGIBLE' | 'NO_SCHOLARSHIP' | 'TERM_ENDED' | 'NOT_IN_TERM';

export function computeEligibility(p: { kind: BorrowerKind; onScholarship: boolean; inTerm: boolean; termEnded: boolean }): Eligibility {
  if (!p.inTerm) return 'NOT_IN_TERM';
  if (p.termEnded) return 'TERM_ENDED';
  if (p.kind === 'ATHLETE' && !p.onScholarship) return 'NO_SCHOLARSHIP';
  return 'ELIGIBLE';
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  ELIGIBLE: 'Can borrow',
  NO_SCHOLARSHIP: 'Not on scholarship',
  TERM_ENDED: 'Term ended',
  NOT_IN_TERM: 'Not in this term',
};

/** A term is over once its return deadline day has passed. Both values are YYYY-MM-DD in America/New_York. */
export const isTermEnded = (returnDeadline: string, todayNy: string) => todayNy > returnDeadline;
