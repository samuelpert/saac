import type { TermRow } from './schemas';

/** Each widget succeeds or fails on its own, so one broken query never blanks the page. */
export type Widget<T> = { ok: true; data: T } | { ok: false; error: string };

/** People tagged for the selected term. */
export interface PeopleTile {
  total: number;
  athletes: number;
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
    attention: Widget<AttentionRow[]>;
    teams: Widget<TeamProgressRow[]>;
    books: Widget<BooksWidget>;
    inventory: Widget<InventoryWidget>;
    /** Admin only. Absent for staff. */
    activity?: Widget<ActivityRow[]>;
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
  openTech: number;
}
