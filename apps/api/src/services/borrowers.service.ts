import { z } from 'zod';
import {
  borrowerInputSchema,
  type BorrowerDetail,
  type BorrowerListResponse,
  type BorrowerSummary,
  type borrowerListQuerySchema,
  type HeldLoan,
  type PastLoan,
  type SearchResponse,
  type TeamRef,
} from '@saac/shared';
import type { Db } from '../db';
import type { Borrower, Prisma, Team } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../http/errors';
import { audit } from './audit';
import { holdingWhere } from './loans.service';

type BorrowerWithTeam = Borrower & { team: Team | null };

export const toSummary = (b: BorrowerWithTeam): BorrowerSummary => ({
  id: b.id,
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  kind: b.kind,
  team: b.team ? { id: b.team.id, name: b.team.name } : null,
  active: b.active,
});

/** Fields an audit entry records for a person. */
export const borrowerSnapshot = (b: Borrower) => ({
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  kind: b.kind,
  teamId: b.teamId,
  email: b.email,
  phone: b.phone,
  onScholarship: b.onScholarship,
  active: b.active,
});

const SEARCH_LIMIT = 20;
const TAG_PATTERN = /^[A-Z]-?\d+$/i;

/** Every typed word must start the first or last name, so "fakeman al" finds Alex but not Cal. */
function nameWhere(q: string): Prisma.BorrowerWhereInput {
  const tokens = q.split(/[\s,]+/).filter(Boolean).slice(0, 4);
  return {
    AND: tokens.map((t) => ({
      OR: [
        { firstName: { startsWith: t, mode: 'insensitive' } },
        { lastName: { startsWith: t, mode: 'insensitive' } },
        // Two-word names such as "De La Cruz" also match on a later word.
        { lastName: { contains: ` ${t}`, mode: 'insensitive' } },
        { firstName: { contains: ` ${t}`, mode: 'insensitive' } },
      ],
    })),
  };
}

export class BorrowersService {
  constructor(private readonly db: Db) {}

  async search(raw: string): Promise<SearchResponse> {
    const q = raw.trim();
    const find = (where: Prisma.BorrowerWhereInput) =>
      this.db.borrower
        .findMany({ where, include: { team: true }, orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }], take: SEARCH_LIMIT })
        .then((rows) => rows.map(toSummary));

    if (q === '') return { kind: 'empty', matches: [] };
    if (/^\d{7}$/.test(q)) return { kind: 'pid', matches: await find({ pid: q }) };
    if (/^\d{6}$/.test(q)) {
      const suggestedPid = `0${q}`;
      return { kind: 'pid-short', suggestedPid, matches: await find({ pid: suggestedPid }) };
    }
    if (/^\d+$/.test(q)) {
      return { kind: 'digits', matches: q.length < 7 ? await find({ pid: { startsWith: q } }) : [] };
    }
    if (TAG_PATTERN.test(q)) return { kind: 'tag', matches: [] };
    return { kind: 'name', matches: await find(nameWhere(q)) };
  }

  async list(query: z.infer<typeof borrowerListQuerySchema> & { holdingTermId?: string }): Promise<BorrowerListResponse> {
    const where: Prisma.BorrowerWhereInput = {
      AND: [
        query.active === 'all' ? {} : { active: query.active === 'true' },
        query.kind ? { kind: query.kind } : {},
        query.teamId ? { teamId: query.teamId } : {},
        query.holdingTermId ? holdingWhere(query.holdingTermId) : {},
        query.q ? (/^\d+$/.test(query.q) ? { pid: { startsWith: query.q } } : nameWhere(query.q)) : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.db.borrower.count({ where }),
      this.db.borrower.findMany({
        where,
        include: { team: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { pid: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async detail(id: string): Promise<BorrowerDetail> {
    const b = await this.db.borrower.findUnique({
      where: { id },
      include: {
        team: true,
        enrollments: { include: { course: { include: { semester: true } } } },
        bookLoans: { include: { semester: true, copy: { include: { book: true } } }, orderBy: { checkedOutAt: 'desc' } },
        itemLoans: { include: { semester: true, item: { include: { type: true } } }, orderBy: { checkedOutAt: 'desc' } },
      },
    });
    if (!b) throw notFound('No such person');
    const now = new Date();

    const holding: HeldLoan[] = [
      ...b.itemLoans
        .filter((l) => l.closedAt === null)
        .map((l) => ({
          id: l.id,
          kind: 'tech' as const,
          label: l.item.name,
          tag: l.item.assetTag,
          typeName: l.item.type.name,
          termCode: l.semester.code,
          checkedOutAt: l.checkedOutAt.toISOString(),
          dueDate: l.dueDate.toISOString(),
          pastDue: l.dueDate < now,
        })),
      ...b.bookLoans
        .filter((l) => l.closedAt === null)
        .map((l) => ({
          id: l.id,
          kind: 'book' as const,
          label: l.copy.book.title,
          tag: l.copy.copyTag,
          typeName: 'Books',
          termCode: l.semester.code,
          checkedOutAt: l.checkedOutAt.toISOString(),
          dueDate: l.dueDate.toISOString(),
          pastDue: l.dueDate < now,
        })),
    ];
    const counts = new Map<string, number>();
    for (const h of holding) counts.set(h.typeName, (counts.get(h.typeName) ?? 0) + 1);

    const closed: (PastLoan & { startsOn: Date })[] = [
      ...b.itemLoans
        .filter((l) => l.closedAt !== null && l.outcome !== null)
        .map((l) => ({
          id: l.id,
          kind: 'tech' as const,
          label: l.item.name,
          tag: l.item.assetTag,
          termCode: l.semester.code,
          startsOn: l.semester.startsOn,
          checkedOutAt: l.checkedOutAt.toISOString(),
          closedAt: l.closedAt!.toISOString(),
          outcome: l.outcome!,
        })),
      ...b.bookLoans
        .filter((l) => l.closedAt !== null && l.outcome !== null)
        .map((l) => ({
          id: l.id,
          kind: 'book' as const,
          label: l.copy.book.title,
          tag: l.copy.copyTag,
          termCode: l.semester.code,
          startsOn: l.semester.startsOn,
          checkedOutAt: l.checkedOutAt.toISOString(),
          closedAt: l.closedAt!.toISOString(),
          outcome: l.outcome!,
        })),
    ].sort((a, z2) => z2.startsOn.getTime() - a.startsOn.getTime() || z2.checkedOutAt.localeCompare(a.checkedOutAt));
    const past: BorrowerDetail['past'] = [];
    for (const { startsOn: _s, ...loan } of closed) {
      const last = past.at(-1);
      if (last && last.termCode === loan.termCode) last.loans.push(loan);
      else past.push({ termCode: loan.termCode, loans: [loan] });
    }

    return {
      ...toSummary(b),
      email: b.email,
      phone: b.phone,
      onScholarship: b.onScholarship,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      classes: b.enrollments
        .map((e) => ({ termCode: e.course.semester.code, subject: e.course.subject, catalog: e.course.catalog, section: e.course.section, startsOn: e.course.semester.startsOn }))
        .sort((a, z2) => z2.startsOn.getTime() - a.startsOn.getTime() || `${a.subject}${a.catalog}`.localeCompare(`${z2.subject}${z2.catalog}`))
        .map(({ startsOn: _s, ...c }) => c),
      holding,
      holdingCounts: [...counts.entries()].map(([label, count]) => ({ label, count })),
      past,
    };
  }

  private async checkTeam(teamId: string | null | undefined) {
    if (teamId && !(await this.db.team.findUnique({ where: { id: teamId } }))) throw badRequest('No such team');
  }

  async create(actorId: string, raw: unknown): Promise<BorrowerSummary> {
    const input = borrowerInputSchema.parse(raw);
    await this.checkTeam(input.teamId);
    if (await this.db.borrower.findUnique({ where: { pid: input.pid } })) throw conflict(`PID ${input.pid} is already on file`);
    return this.db.$transaction(async (tx) => {
      const b = await tx.borrower.create({
        data: { ...input, teamId: input.teamId ?? null, email: input.email ?? null, phone: input.phone ?? null },
        include: { team: true },
      });
      await audit(tx, { userId: actorId, action: 'borrower.create', entityType: 'Borrower', entityId: b.id, after: borrowerSnapshot(b) });
      return toSummary(b);
    });
  }

  async update(actorId: string, id: string, raw: unknown): Promise<BorrowerSummary> {
    const input = borrowerInputSchema.parse(raw);
    await this.checkTeam(input.teamId);
    return this.db.$transaction(async (tx) => {
      const before = await tx.borrower.findUnique({ where: { id } });
      if (!before) throw notFound('No such person');
      if (input.pid !== before.pid && (await tx.borrower.findUnique({ where: { pid: input.pid } }))) {
        throw conflict(`PID ${input.pid} is already on file`);
      }
      const after = await tx.borrower.update({
        where: { id },
        data: { ...input, teamId: input.teamId ?? null, email: input.email ?? null, phone: input.phone ?? null },
        include: { team: true },
      });
      await audit(tx, {
        userId: actorId,
        action: 'borrower.update',
        entityType: 'Borrower',
        entityId: id,
        before: borrowerSnapshot(before),
        after: borrowerSnapshot(after),
      });
      return toSummary(after);
    });
  }

  async teams(): Promise<TeamRef[]> {
    return this.db.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
