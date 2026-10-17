import type { BorrowerKind } from './schemas';

/**
 * What a person may borrow right now in a term. This is the one definition: the dashboard,
 * the lists, the person page and (phase 4) the checkout service all use it.
 *
 * Athletes (books and tech):
 * - NOT_IN_TERM: no tag for the term.
 * - TERM_ENDED: tagged, but the term's return deadline has passed. Scholarship does not carry over:
 *   from the day after the deadline nobody can borrow until the next term's list is imported.
 * - NO_SCHOLARSHIP: tagged and the term is open, but not on scholarship.
 * - ELIGIBLE: tagged, the term is open, and on scholarship. Books and tech.
 *
 * Staff and graduate assistants (tech only, never books). Term tags and deadlines do not apply:
 * - TECH_ONLY: active staff. Tech only.
 * - STAFF_INACTIVE: an admin switched them off.
 *
 * Returning items is never blocked by this.
 */
export type Eligibility = 'ELIGIBLE' | 'TECH_ONLY' | 'NO_SCHOLARSHIP' | 'TERM_ENDED' | 'NOT_IN_TERM' | 'STAFF_INACTIVE';

export interface EligibilityInput {
  kind: BorrowerKind;
  onScholarship: boolean;
  staffActive: boolean;
  inTerm: boolean;
  termEnded: boolean;
}

export function computeEligibility(p: EligibilityInput): Eligibility {
  if (p.kind !== 'ATHLETE') return p.staffActive ? 'TECH_ONLY' : 'STAFF_INACTIVE';
  if (!p.inTerm) return 'NOT_IN_TERM';
  if (p.termEnded) return 'TERM_ENDED';
  if (!p.onScholarship) return 'NO_SCHOLARSHIP';
  return 'ELIGIBLE';
}

/** Whether a status allows borrowing this kind of item. Checkout asks this for every cart line. */
export function canBorrow(status: Eligibility, item: 'book' | 'tech'): boolean {
  if (status === 'ELIGIBLE') return true;
  if (status === 'TECH_ONLY') return item === 'tech';
  return false;
}

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  ELIGIBLE: 'Can borrow',
  TECH_ONLY: 'Staff · tech only',
  NO_SCHOLARSHIP: 'Not on scholarship',
  TERM_ENDED: 'Term ended',
  NOT_IN_TERM: 'Not in this term',
  STAFF_INACTIVE: 'Inactive staff',
};

/** A term is over once its return deadline day has passed. Both values are YYYY-MM-DD in America/New_York. */
export const isTermEnded = (returnDeadline: string, todayNy: string) => todayNy > returnDeadline;
