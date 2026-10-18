import { z } from 'zod';
import {
  borrowerInputSchema,
  computeEligibility,
  isTermEnded,
  type BorrowerDetail,
  type BorrowerListResponse,
  type BorrowerSummary,
  type borrowerListQuerySchema,
  type HeldLoan,
  type PastLoan,
  type SearchResponse,
  type TeamRef,
} from '@saac/shared';
import type { Db, Tx } from '../db';
import { nyDate } from '../lib/dates';
import type { Borrower, BorrowerTerm, Prisma, Semester, Team } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../http/errors';
import { audit } from './audit';
import { holdingWhere } from './loans.service';
import type { TermsService } from './terms.service';

type TermTag = BorrowerTerm & { semester: Pick<Semester, 'code' | 'startsOn'> };
type BorrowerWithTeam = Borrower & { team: Team | null; terms: TermTag[] };

/** What to load so a person can be shown with their tags. */
export const summaryInclude = { team: true, terms: { include: { semester: { select: { code: true, startsOn: true } } } } } as const;

/** The term a list or search is judged against: the one asked for, else the current term. */
export interface RefTerm {
  id: string;
  code: string;
  /** YYYY-MM-DD. The term is over from the day after. */
  returnDeadline: string;
}

export const toSummary = (b: BorrowerWithTeam, ref: RefTerm | null, today = nyDate(new Date())): BorrowerSummary => ({
  id: b.id,
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  kind: b.kind,
  team: b.team ? { id: b.team.id, name: b.team.name } : null,
  onScholarship: b.onScholarship,
  staffActive: b.staffActive,
  terms: [...b.terms].sort((a, z) => z.semester.startsOn.getTime() - a.semester.startsOn.getTime()).map((t) => t.semester.code),
  eligibility: ref
    ? computeEligibility({ kind: b.kind, onScholarship: b.onScholarship, staffActive: b.staffActive, inTerm: b.terms.some((t) => t.semesterId === ref.id), termEnded: isTermEnded(ref.returnDeadline, today) })
    : null,
  eligibilityTerm: ref?.code ?? null,
});

/** Fields an audit entry records for a person. */
export const borrowerSnapshot = (b: Borrower, termCodes?: string[]) => ({
  pid: b.pid,
  firstName: b.firstName,
  lastName: b.lastName,
  kind: b.kind,
  teamId: b.teamId,
  email: b.email,
  phone: b.phone,
  onScholarship: b.onScholarship,
  staffActive: b.staffActive,
  ...(termCodes ? { terms: [...termCodes].sort() } : {}),
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
  constructor(
    private readonly db: Db,
    private readonly terms: TermsService,
  ) {}

  /** The term to judge eligibility against: the requested term, else the current one. */
  async refTerm(code?: string): Promise<RefTerm | null> {
    const t = await this.terms.resolve(code);
    return t ? { id: t.id, code: t.code, returnDeadline: t.returnDeadline } : null;
  }

  async search(raw: string, termCode?: string): Promise<SearchResponse> {
    const q = raw.trim();
    const ref = await this.refTerm(termCode);
    const find = (where: Prisma.BorrowerWhereInput) =>
      this.db.borrower
        .findMany({ where, include: summaryInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: SEARCH_LIMIT })
        .then((rows) => rows.map((b) => toSummary(b, ref)));

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
    const ref = await this.refTerm(query.term);
    const where: Prisma.BorrowerWhereInput = {
      AND: [
        query.term ? { terms: { some: { semesterId: ref!.id } } } : {},
        query.kind ? { kind: query.kind } : {},
        query.staffActive ? { kind: 'STAFF', staffActive: query.staffActive === 'true' } : {},
        query.teamId ? { teamId: query.teamId } : {},
        query.holdingTermId ? holdingWhere(query.holdingTermId) : {},
        query.q ? (/^\d+$/.test(query.q) ? { pid: { startsWith: query.q } } : nameWhere(query.q)) : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.db.borrower.count({ where }),
      this.db.borrower.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { pid: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map((b) => toSummary(b, ref)), total, page: query.page, pageSize: query.pageSize };
  }

  async detail(id: string): Promise<BorrowerDetail> {
    const b = await this.db.borrower.findUnique({
      where: { id },
      include: {
        ...summaryInclude,
        enrollments: { include: { course: { include: { semester: true } } } },
        bookLoans: { include: { semester: true, copy: { include: { book: true } } }, orderBy: { checkedOutAt: 'desc' } },
        itemLoans: { include: { semester: true, item: { include: { type: true } } }, orderBy: { checkedOutAt: 'desc' } },
      },
    });
    if (!b) throw notFound('No such person');
    const now = new Date();
    const ref = await this.refTerm();

    const holding: HeldLoan[] = [
      ...b.itemLoans
        .filter((l) => l.closedAt === null)
        .map((l) => ({
          id: l.id,
          kind: 'tech' as const,
          itemId: l.itemId,
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
          itemId: l.copyId,
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
      ...toSummary(b, ref),
      email: b.email,
      phone: b.phone,
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

  /** Term codes to semester rows. An unknown code is an error, never silently dropped. */
  private async resolveTerms(tx: Tx | Db, codes: string[]): Promise<Semester[]> {
    const unique = [...new Set(codes)];
    const found = await tx.semester.findMany({ where: { code: { in: unique } } });
    const missing = unique.filter((c) => !found.some((f) => f.code === c));
    if (missing.length > 0) throw badRequest(`No such term: ${missing.join(', ')}`);
    return found;
  }

  async create(actorId: string, raw: unknown): Promise<BorrowerSummary> {
    const input = borrowerInputSchema.parse(raw);
    await this.checkTeam(input.teamId);
    if (await this.db.borrower.findUnique({ where: { pid: input.pid } })) throw conflict(`PID ${input.pid} is already on file`);
    const { termCodes, ...fields } = input;
    return this.db.$transaction(async (tx) => {
      const semesters = await this.resolveTerms(tx, termCodes);
      const b = await tx.borrower.create({
        data: { ...fields, teamId: fields.teamId ?? null, email: fields.email ?? null, phone: fields.phone ?? null },
      });
      if (semesters.length > 0) await tx.borrowerTerm.createMany({ data: semesters.map((s) => ({ borrowerId: b.id, semesterId: s.id })) });
      await audit(tx, { userId: actorId, action: 'borrower.create', entityType: 'Borrower', entityId: b.id, after: borrowerSnapshot(b, semesters.map((s) => s.code)) });
      const full = await tx.borrower.findUniqueOrThrow({ where: { id: b.id }, include: summaryInclude });
      return toSummary(full, await this.refTerm());
    });
  }

  async update(actorId: string, id: string, raw: unknown): Promise<BorrowerSummary> {
    const input = borrowerInputSchema.parse(raw);
    await this.checkTeam(input.teamId);
    const { termCodes, ...fields } = input;
    return this.db.$transaction(async (tx) => {
      const before = await tx.borrower.findUnique({ where: { id }, include: { terms: { include: { semester: true } } } });
      if (!before) throw notFound('No such person');
      if (fields.pid !== before.pid && (await tx.borrower.findUnique({ where: { pid: fields.pid } }))) {
        throw conflict(`PID ${fields.pid} is already on file`);
      }
      const wanted = await this.resolveTerms(tx, termCodes);
      const have = new Set(before.terms.map((t) => t.semesterId));
      const want = new Set(wanted.map((s) => s.id));
      const toAdd = wanted.filter((s) => !have.has(s.id));
      const toRemove = before.terms.filter((t) => !want.has(t.semesterId));
      const after = await tx.borrower.update({
        where: { id },
        data: { ...fields, teamId: fields.teamId ?? null, email: fields.email ?? null, phone: fields.phone ?? null },
      });
      if (toAdd.length > 0) await tx.borrowerTerm.createMany({ data: toAdd.map((s) => ({ borrowerId: id, semesterId: s.id })) });
      if (toRemove.length > 0) await tx.borrowerTerm.deleteMany({ where: { borrowerId: id, semesterId: { in: toRemove.map((t) => t.semesterId) } } });
      await audit(tx, {
        userId: actorId,
        action: 'borrower.update',
        entityType: 'Borrower',
        entityId: id,
        before: borrowerSnapshot(before, before.terms.map((t) => t.semester.code)),
        after: borrowerSnapshot(after, wanted.map((s) => s.code)),
      });
      const full = await tx.borrower.findUniqueOrThrow({ where: { id }, include: summaryInclude });
      return toSummary(full, await this.refTerm());
    });
  }

  /**
   * An admin switches a student's scholarship on or off from their profile. There is no override
   * at checkout: this switch is the only way past "not on scholarship". The next student import
   * for a term sets it again from the file.
   */
  async setScholarship(actorId: string, id: string, onScholarship: boolean): Promise<BorrowerSummary> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.borrower.findUnique({ where: { id } });
      if (!before) throw notFound('No such person');
      if (before.kind === 'STAFF') throw badRequest('Staff have no scholarship. Use the active switch instead.');
      const after = await tx.borrower.update({ where: { id }, data: { onScholarship } });
      if (before.onScholarship !== onScholarship) {
        await audit(tx, {
          userId: actorId,
          action: 'borrower.scholarship',
          entityType: 'Borrower',
          entityId: id,
          before: { pid: before.pid, onScholarship: before.onScholarship },
          after: { pid: after.pid, onScholarship },
        });
      }
      const full = await tx.borrower.findUniqueOrThrow({ where: { id }, include: summaryInclude });
      return toSummary(full, await this.refTerm());
    });
  }

  async teams(): Promise<TeamRef[]> {
    return this.db.team.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
