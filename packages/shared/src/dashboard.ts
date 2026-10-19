import type { TermRow } from './schemas';

/** Each widget succeeds or fails on its own, so one broken query never blanks the page. */
export type Widget<T> = { ok: true; data: T } | { ok: false; error: string };

/** People tagged for the selected term. */
export interface PeopleTile {
  total: number;
  athletes: number;
  gradAssistants: number;
  staff: number;
}

export interface PastDueTile {
  total: number;
  books: number;
  tech: number;
}

export interface HoldsTile {
  total: number;
  pending: number;
  onHold: number;
}

export interface DeadlineTile {
  returnDeadline: string;
  /** Whole days from today (America/New_York) to the deadline. Negative once it has passed. */
  daysLeft: number;
  peopleHolding: number;
}

export type AttentionTone = 'warn' | 'danger' | 'info';

export interface AttentionRow {
  key: string;
  text: string;
  count: number;
  tone: AttentionTone;
  href: string;
}

export interface TeamProgressRow {
  teamId: string;
  name: string;
  /** All loans this term for people on the team, books and tech. */
  total: number;
  returned: number;
  /** Open and not yet past due. */
  out: number;
  pastDue: number;
  peopleWithItems: number;
}

export interface BooksWidget {
  hasBookList: boolean;
  needed: number;
  assigned: number;
  issued: number;
  waived: number;
  shortTitles: number;
  shortNeeds: number;
}

export interface TechTypeRow {
  typeId: string;
  type: string;
  available: number;
  out: number;
  inRepair: number;
  surplus: number;
  retired: number;
}

export interface InventoryWidget {
  tech: TechTypeRow[];
  copies: { total: number; available: number; assigned: number; out: number; retired: number };
}

export interface ActivityRow {
  id: string;
  at: string;
  user: string;
  action: string;
  label: string;
}

export interface ImportSummary {
  kind: string;
  at: string;
  user: string;
  created: number;
  updated: number;
  unchanged: number;
  review: number;
}

export interface HealthWidget {
  lastSuccess: { at: string; location: string; sizeBytes: number | null } | null;
  lastAttempt: { at: string; ok: boolean; message: string | null } | null;
  stale: boolean;
  staleAfterHours: number;
  disk: { freeBytes: number; totalBytes: number } | null;
  databaseBytes: number;
  uptimeSeconds: number;
}

export interface DashboardResponse {
  term: TermRow | null;
  terms: TermRow[];
  isPast: boolean;
  generatedAt: string;
  isAdmin: boolean;
  widgets: {
    people: Widget<PeopleTile>;
    booksOut: Widget<number>;
    techOut: Widget<number>;
    pastDue: Widget<PastDueTile>;
    holds: Widget<HoldsTile>;
    deadline: Widget<DeadlineTile | null>;
    teams: Widget<TeamProgressRow[]>;
    books: Widget<BooksWidget>;
    inventory: Widget<InventoryWidget>;
    activity: Widget<ActivityRow[]>;
    /** Admin only. Absent for staff. */
    attention?: Widget<AttentionRow[]>;
    imports?: Widget<ImportSummary[]>;
    health?: Widget<HealthWidget>;
  };
}

// ---- Drill-down lists behind the dashboard numbers ---------------------------

/** A person as the lists show them. `name` is "Last, First". */
export interface PersonRef {
  id: string;
  pid: string;
  firstName: string;
  lastName: string;
  name: string;
  team: string | null;
}

export interface LoanListRow {
  id: string;
  kind: 'book' | 'tech';
  /** The tech item or book copy, for its history page. */
  itemId: string;
  borrower: PersonRef;
  label: string;
  tag: string;
  typeName: string;
  checkedOutAt: string;
  dueDate: string;
  pastDue: boolean;
}

export interface HoldListRow {
  borrower: PersonRef;
  stage: 'HOLD_PENDING_REVIEW' | 'ON_HOLD';
  note: string | null;
  updatedAt: string;
  /** Open loans, books and tech. */
  openItems: number;
}

// ---- Item lookup and history ------------------------------------------------------

/** Derived, never stored. A copy is ASSIGNED when it is reserved for a student's need. */
export type ItemState = 'AVAILABLE' | 'OUT' | 'ASSIGNED' | 'IN_REPAIR' | 'SURPLUS' | 'RETIRED';

export interface ItemMatch {
  id: string;
  kind: 'tech' | 'book';
  tag: string;
  /** The saved identifier a barcode holds: the tech item's asset tag or the copy's tag. */
  code: string;
  name: string;
  typeName: string;
  state: ItemState;
  /** Who has it now, when it is out. */
  holder: PersonRef | null;
  dueDate: string | null;
  pastDue: boolean;
}

export interface ItemLoanHistoryRow {
  id: string;
  borrower: PersonRef;
  termCode: string;
  checkedOutAt: string;
  dueDate: string;
  closedAt: string | null;
  outcome: 'RETURNED' | 'NOT_FOR_RETURN' | null;
  conditionOut: string | null;
  conditionIn: string | null;
  notes: string | null;
}

export interface ItemHistory extends ItemMatch {
  statusNote: string | null;
  loans: ItemLoanHistoryRow[];
  /** Status changes, retirements and edits from the audit log, newest first. */
  events: { at: string; user: string; action: string; note: string | null }[];
}
