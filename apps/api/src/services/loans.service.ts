import type { HoldListRow, LoanListRow } from '@saac/shared';
import type { Db } from '../db';
import type { Prisma } from '../generated/prisma/client';

/**
 * The one place that defines "out" and "past due". The dashboard counts and the lists
 * behind them both build their queries from these, so a number can never disagree with its list.
 *
 * Open means closedAt IS NULL. Past due means open and dueDate before now.
 */
export type LoanFilter = 'open' | 'pastdue';

export interface LoanQuery {
  semesterId: string;
  filter: LoanFilter;
  teamId?: string;
  now?: Date;
}

export function bookLoanWhere(q: LoanQuery): Prisma.BookLoanWhereInput {
  return {
    semesterId: q.semesterId,
    closedAt: null,
    ...(q.filter === 'pastdue' ? { dueDate: { lt: q.now ?? new Date() } } : {}),
    ...(q.teamId ? { borrower: { teamId: q.teamId } } : {}),
  };
}

export function itemLoanWhere(q: LoanQuery): Prisma.ItemLoanWhereInput {
  return {
    semesterId: q.semesterId,
    closedAt: null,
    ...(q.filter === 'pastdue' ? { dueDate: { lt: q.now ?? new Date() } } : {}),
    ...(q.teamId ? { borrower: { teamId: q.teamId } } : {}),
  };
}

export const HOLD_STAGES = ['HOLD_PENDING_REVIEW', 'ON_HOLD'] as const;

export function holdsWhere(semesterId: string): Prisma.EscalationWhereInput {
  return { semesterId, stage: { in: [...HOLD_STAGES] } };
}

/** People with at least one open loan, book or tech, in the term. */
export function holdingWhere(semesterId: string): Prisma.BorrowerWhereInput {
  return {
    OR: [
      { bookLoans: { some: { semesterId, closedAt: null } } },
      { itemLoans: { some: { semesterId, closedAt: null } } },
    ],
  };
}

const borrowerSelect = { id: true, pid: true, firstName: true, lastName: true, team: { select: { name: true } } } as const;

const borrowerRef = (b: { id: string; pid: string; firstName: string; lastName: string; team: { name: string } | null }) => ({
  id: b.id,
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  name: `${b.lastName}, ${b.firstName}`,
  team: b.team?.name ?? null,
});

export class LoansService {
  constructor(private readonly db: Db) {}

  async listBooks(q: LoanQuery): Promise<LoanListRow[]> {
    const now = q.now ?? new Date();
    const loans = await this.db.bookLoan.findMany({
      where: bookLoanWhere({ ...q, now }),
      include: { borrower: { select: borrowerSelect }, copy: { include: { book: true } } },
      orderBy: [{ dueDate: 'asc' }, { checkedOutAt: 'asc' }],
    });
    return loans.map((l) => ({
      id: l.id,
      kind: 'book',
      borrower: borrowerRef(l.borrower),
      label: l.copy.book.title,
      tag: l.copy.copyTag,
      typeName: 'Book',
      checkedOutAt: l.checkedOutAt.toISOString(),
      dueDate: l.dueDate.toISOString(),
      pastDue: l.dueDate < now,
    }));
  }

  async listItems(q: LoanQuery): Promise<LoanListRow[]> {
    const now = q.now ?? new Date();
    const loans = await this.db.itemLoan.findMany({
      where: itemLoanWhere({ ...q, now }),
      include: { borrower: { select: borrowerSelect }, item: { include: { type: true } } },
      orderBy: [{ dueDate: 'asc' }, { checkedOutAt: 'asc' }],
    });
    return loans.map((l) => ({
      id: l.id,
      kind: 'tech',
      borrower: borrowerRef(l.borrower),
      label: l.item.name,
      tag: l.item.assetTag,
      typeName: l.item.type.name,
      checkedOutAt: l.checkedOutAt.toISOString(),
      dueDate: l.dueDate.toISOString(),
      pastDue: l.dueDate < now,
    }));
  }

  async listHolds(semesterId: string): Promise<HoldListRow[]> {
    const rows = await this.db.escalation.findMany({
      where: holdsWhere(semesterId),
      include: {
        borrower: {
          select: {
            ...borrowerSelect,
            _count: { select: { itemLoans: { where: { semesterId, closedAt: null } } } },
          },
        },
      },
      orderBy: [{ stage: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((e) => ({
      borrower: borrowerRef(e.borrower),
      stage: e.stage as HoldListRow['stage'],
      note: e.note,
      updatedAt: e.updatedAt.toISOString(),
      openTech: e.borrower._count.itemLoans,
    }));
  }
}
