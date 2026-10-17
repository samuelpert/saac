import type { ItemHistory, ItemLoanHistoryRow, ItemMatch, ItemState } from '@saac/shared';
import type { Db } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { notFound } from '../http/errors';

const LOOKUP_LIMIT = 10;

const personSelect = { id: true, pid: true, firstName: true, lastName: true, team: { select: { name: true } } } as const;
type PersonRow = { id: string; pid: string; firstName: string; lastName: string; team: { name: string } | null };
const personRef = (b: PersonRow) => ({
  id: b.id,
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  name: `${b.lastName}, ${b.firstName}`,
  team: b.team?.name ?? null,
});

/** Every typed word must appear in the tag or the name, so "laptop 942" finds "SAAC Laptop 942". */
function techWhere(q: string): Prisma.ItemWhereInput {
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: tokens.map((t) => ({
      OR: [{ assetTag: { contains: t, mode: 'insensitive' } }, { name: { contains: t, mode: 'insensitive' } }],
    })),
  };
}

const openLoanInclude = {
  loans: { where: { closedAt: null }, include: { borrower: { select: personSelect } }, take: 1 },
} as const;

/**
 * Find tech items by tag or name, and book copies by tag. Availability is derived from
 * loans and status, never stored, the same way the dashboard counts it.
 */
export class ItemsService {
  constructor(private readonly db: Db) {}

  async lookup(raw: string, now = new Date()): Promise<ItemMatch[]> {
    const q = raw.trim();
    if (q.length < 2) return [];
    const [items, copies] = await Promise.all([
      this.db.item.findMany({ where: techWhere(q), include: { type: true, ...openLoanInclude }, orderBy: { assetTag: 'asc' }, take: LOOKUP_LIMIT }),
      this.db.bookCopy.findMany({
        where: { copyTag: { equals: q, mode: 'insensitive' } },
        include: { book: true, needs: { where: { status: 'ASSIGNED' }, take: 1 }, ...openLoanInclude },
        take: LOOKUP_LIMIT,
      }),
    ]);
    return [...items.map((i) => this.techMatch(i, now)), ...copies.map((c) => this.copyMatch(c, now))];
  }

  private techMatch(
    i: { id: string; assetTag: string; name: string; status: 'IN_SERVICE' | 'IN_REPAIR' | 'SURPLUS'; retiredAt: Date | null; type: { name: string }; loans: { dueDate: Date; borrower: PersonRow }[] },
    now: Date,
  ): ItemMatch {
    const open = i.loans[0];
    const state: ItemState = i.retiredAt ? 'RETIRED' : open ? 'OUT' : i.status === 'IN_REPAIR' ? 'IN_REPAIR' : i.status === 'SURPLUS' ? 'SURPLUS' : 'AVAILABLE';
    return {
      id: i.id,
      kind: 'tech',
      tag: i.assetTag,
      name: i.name,
      typeName: i.type.name,
      state,
      holder: open ? personRef(open.borrower) : null,
      dueDate: open?.dueDate.toISOString() ?? null,
      pastDue: open ? open.dueDate < now : false,
    };
  }

  private copyMatch(
    c: { id: string; copyTag: string; retiredAt: Date | null; book: { title: string }; needs: unknown[]; loans: { dueDate: Date; borrower: PersonRow }[] },
    now: Date,
  ): ItemMatch {
    const open = c.loans[0];
    const state: ItemState = open ? 'OUT' : c.retiredAt ? 'RETIRED' : c.needs.length > 0 ? 'ASSIGNED' : 'AVAILABLE';
    return {
      id: c.id,
      kind: 'book',
      tag: c.copyTag,
      name: c.book.title,
      typeName: 'Book',
      state,
      holder: open ? personRef(open.borrower) : null,
      dueDate: open?.dueDate.toISOString() ?? null,
      pastDue: open ? open.dueDate < now : false,
    };
  }

  /** Who has it now, and every earlier checkout and check-in, newest first. */
  async history(kind: 'tech' | 'book', id: string, now = new Date()): Promise<ItemHistory> {
    const loanInclude = { borrower: { select: personSelect }, semester: { select: { code: true } } } as const;
    if (kind === 'tech') {
      const i = await this.db.item.findUnique({
        where: { id },
        include: { type: true, ...openLoanInclude },
      });
      if (!i) throw notFound('No such item');
      const loans = await this.db.itemLoan.findMany({ where: { itemId: id }, include: loanInclude, orderBy: { checkedOutAt: 'desc' } });
      return {
        ...this.techMatch(i, now),
        statusNote: i.statusNote,
        loans: loans.map((l) => this.historyRow(l, l.conditionOut)),
      };
    }
    const c = await this.db.bookCopy.findUnique({
      where: { id },
      include: { book: true, needs: { where: { status: 'ASSIGNED' }, take: 1 }, ...openLoanInclude },
    });
    if (!c) throw notFound('No such copy');
    const loans = await this.db.bookLoan.findMany({ where: { copyId: id }, include: loanInclude, orderBy: { checkedOutAt: 'desc' } });
    return { ...this.copyMatch(c, now), statusNote: c.notes, loans: loans.map((l) => this.historyRow(l, null)) };
  }

  private historyRow(
    l: {
      id: string;
      borrower: PersonRow;
      semester: { code: string };
      checkedOutAt: Date;
      dueDate: Date;
      closedAt: Date | null;
      outcome: 'RETURNED' | 'NOT_FOR_RETURN' | null;
      conditionIn: string | null;
      notes: string | null;
    },
    conditionOut: string | null,
  ): ItemLoanHistoryRow {
    return {
      id: l.id,
      borrower: personRef(l.borrower),
      termCode: l.semester.code,
      checkedOutAt: l.checkedOutAt.toISOString(),
      dueDate: l.dueDate.toISOString(),
      closedAt: l.closedAt?.toISOString() ?? null,
      outcome: l.outcome,
      conditionOut,
      conditionIn: l.conditionIn,
      notes: l.notes,
    };
  }
}
