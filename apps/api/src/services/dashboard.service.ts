import { statfs } from 'node:fs/promises';
import type {
  ActivityRow,
  AttentionRow,
  BooksWidget,
  DashboardResponse,
  DeadlineTile,
  HealthWidget,
  HoldsTile,
  ImportSummary,
  InventoryWidget,
  PastDueTile,
  PeopleTile,
  TeamProgressRow,
  TermRow,
  Widget,
} from '@saac/shared';
import type { Db } from '../db';
import { daysBetween, nyDate } from '../lib/dates';
import { bookLoanWhere, holdingWhere, holdsWhere, itemLoanWhere } from './loans.service';
import { STUDENT_IMPORT_KIND } from './studentImport/service';
import { isPastTerm, type TermsService } from './terms.service';

export interface DashboardOptions {
  backupStaleHours: number;
  /** Folder whose disk is reported as free space; the backup folder by default. */
  diskPath: string;
  /** Days after the return deadline before the hold list is ready. A setting later; 0 for now. */
  holdGraceDays?: number;
}

// Matches no row. Used when no term exists yet, so every term widget shows zero.
const NO_TERM = '00000000-0000-0000-0000-000000000000';

const HIDDEN_FROM_ACTIVITY = ['user.login', 'user.logout', 'borrower.import_create', 'borrower.import_update', 'borrower.import_untag'];

const ACTION_LABEL: Record<string, string> = {
  'borrower.create': 'Added person',
  'borrower.update': 'Edited person',
  'import.students': 'Imported students',
  'user.create': 'Created user',
  'user.update': 'Edited user',
  'user.password_reset': 'Reset a password',
  'user.password_changed': 'Changed own password',
  'term.create': 'Created term',
  'term.update': 'Edited term',
  'term.make_current': 'Changed current term',
};

/** "Maria Alvarez" becomes "M. Alvarez". */
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]![0]}. ${parts.at(-1)}`;
};

/** Show only the first and last digit of a PID on the dashboard. */
export const maskPid = (pid: string) => (pid.length === 7 ? `${pid[0]}•••••${pid[6]}` : '•••••••');

const num = (v: unknown) => Number(v ?? 0);

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly terms: TermsService,
    private readonly opts: DashboardOptions,
  ) {}

  /** Run one widget's queries. A failure stays inside that widget. */
  private async safe<T>(name: string, fn: () => Promise<T>): Promise<Widget<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      console.error(`[dashboard] widget "${name}" failed${code ? ` (${code})` : ''}`);
      return { ok: false, error: 'This panel could not load. It will try again on the next refresh.' };
    }
  }

  async get(termCode: string | undefined, isAdmin: boolean, now = new Date()): Promise<DashboardResponse> {
    const [term, terms] = await Promise.all([this.terms.resolve(termCode), this.terms.list()]);
    const termId = term?.id ?? NO_TERM;

    const [people, booksOut, techOut, pastDue, holds, deadline, attention, teams, books, inventory, activity, imports, health] = await Promise.all([
      this.safe('people', () => this.people(termId)),
      this.safe('booksOut', () => this.db.bookLoan.count({ where: bookLoanWhere({ semesterId: termId, filter: 'open' }) })),
      this.safe('techOut', () => this.db.itemLoan.count({ where: itemLoanWhere({ semesterId: termId, filter: 'open' }) })),
      this.safe('pastDue', () => this.pastDue(termId, now)),
      this.safe('holds', () => this.holds(termId)),
      this.safe('deadline', () => this.deadline(term, now)),
      isAdmin ? this.safe('attention', () => this.attention(term, isAdmin, now)) : undefined,
      this.safe('teams', () => this.teams(termId, now)),
      this.safe('books', () => this.books(termId)),
      this.safe('inventory', () => this.inventory()),
      this.safe('activity', () => this.activity()),
      isAdmin ? this.safe('imports', () => this.imports()) : undefined,
      isAdmin ? this.safe('health', () => this.health(now)) : undefined,
    ]);

    return {
      term,
      terms,
      isPast: term ? isPastTerm(term, now) : false,
      generatedAt: now.toISOString(),
      isAdmin,
      widgets: {
        people,
        booksOut,
        techOut,
        pastDue,
        holds,
        deadline,
        teams,
        books,
        inventory,
        activity,
        ...(isAdmin ? { attention, imports, health } : {}),
      },
    };
  }

  /** People tagged for the term. Athletes, and staff including graduate assistants. */
  async people(termId: string): Promise<PeopleTile> {
    const groups = await this.db.borrower.groupBy({ by: ['kind'], where: { terms: { some: { semesterId: termId } } }, _count: { _all: true } });
    const by = (k: string) => groups.find((g) => g.kind === k)?._count._all ?? 0;
    const athletes = by('ATHLETE');
    const staff = by('STAFF') + by('GRAD_ASSISTANT');
    return { total: athletes + staff, athletes, staff };
  }

  async pastDue(termId: string, now: Date): Promise<PastDueTile> {
    const [books, tech] = await Promise.all([
      this.db.bookLoan.count({ where: bookLoanWhere({ semesterId: termId, filter: 'pastdue', now }) }),
      this.db.itemLoan.count({ where: itemLoanWhere({ semesterId: termId, filter: 'pastdue', now }) }),
    ]);
    return { total: books + tech, books, tech };
  }

  async holds(termId: string): Promise<HoldsTile> {
    const groups = await this.db.escalation.groupBy({ by: ['stage'], where: holdsWhere(termId), _count: { _all: true } });
    const pending = groups.find((g) => g.stage === 'HOLD_PENDING_REVIEW')?._count._all ?? 0;
    const onHold = groups.find((g) => g.stage === 'ON_HOLD')?._count._all ?? 0;
    return { total: pending + onHold, pending, onHold };
  }

  async deadline(term: TermRow | null, now: Date): Promise<DeadlineTile | null> {
    if (!term) return null;
    const peopleHolding = await this.db.borrower.count({ where: holdingWhere(term.id) });
    return { returnDeadline: term.returnDeadline, daysLeft: daysBetween(nyDate(now), term.returnDeadline), peopleHolding };
  }

  async teams(termId: string, now: Date): Promise<TeamProgressRow[]> {
    const rows = await this.db.$queryRaw<
      { id: string; name: string; total: number; returned: number; out: number; past_due: number; people: number }[]
    >`
      WITH loans AS (
        SELECT "borrowerId", "closedAt", "dueDate" FROM "BookLoan" WHERE "semesterId" = ${termId}
        UNION ALL
        SELECT "borrowerId", "closedAt", "dueDate" FROM "ItemLoan" WHERE "semesterId" = ${termId}
      )
      SELECT t.id, t.name,
        count(*)::int AS total,
        count(*) FILTER (WHERE l."closedAt" IS NOT NULL)::int AS returned,
        count(*) FILTER (WHERE l."closedAt" IS NULL AND l."dueDate" >= ${now})::int AS out,
        count(*) FILTER (WHERE l."closedAt" IS NULL AND l."dueDate" < ${now})::int AS past_due,
        count(DISTINCT l."borrowerId") FILTER (WHERE l."closedAt" IS NULL)::int AS people
      FROM loans l
      JOIN "Borrower" b ON b.id = l."borrowerId"
      JOIN "Team" t ON t.id = b."teamId"
      GROUP BY t.id, t.name
      ORDER BY count(*) FILTER (WHERE l."closedAt" IS NULL) DESC, t.name ASC`;
    return rows.map((r) => ({
      teamId: r.id,
      name: r.name,
      total: num(r.total),
      returned: num(r.returned),
      out: num(r.out),
      pastDue: num(r.past_due),
      peopleWithItems: num(r.people),
    }));
  }

  async books(termId: string): Promise<BooksWidget> {
    const [groups, listed, short] = await Promise.all([
      this.db.bookNeed.groupBy({ by: ['status'], where: { semesterId: termId }, _count: { _all: true } }),
      this.db.courseBook.count({ where: { course: { semesterId: termId } } }),
      this.shortages(termId),
    ]);
    const by = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      hasBookList: listed > 0,
      needed: by('NEEDED'),
      assigned: by('ASSIGNED'),
      issued: by('ISSUED'),
      waived: by('WAIVED'),
      ...short,
    };
  }

  /** A NEEDED need is short when its title has no available copy. */
  async shortages(termId: string): Promise<{ shortTitles: number; shortNeeds: number }> {
    const [row] = await this.db.$queryRaw<{ short_needs: number; short_titles: number }[]>`
      SELECT count(*)::int AS short_needs, count(DISTINCT n."bookId")::int AS short_titles
      FROM "BookNeed" n
      WHERE n."semesterId" = ${termId} AND n.status = 'NEEDED'
        AND NOT EXISTS (
          SELECT 1 FROM "BookCopy" c
          WHERE c."bookId" = n."bookId" AND c."retiredAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "BookLoan" l WHERE l."copyId" = c.id AND l."closedAt" IS NULL)
            AND NOT EXISTS (SELECT 1 FROM "BookNeed" a WHERE a."copyId" = c.id AND a.status = 'ASSIGNED')
        )`;
    return { shortTitles: num(row?.short_titles), shortNeeds: num(row?.short_needs) };
  }

  async inventory(): Promise<InventoryWidget> {
    const [tech, copies] = await Promise.all([
      this.db.$queryRaw<{ id: string; name: string; available: number; out: number; in_repair: number; surplus: number; retired: number }[]>`
        SELECT ty.id, ty.name,
          count(i.id) FILTER (WHERE i."retiredAt" IS NULL AND i.status = 'IN_SERVICE' AND ol.id IS NULL)::int AS available,
          count(i.id) FILTER (WHERE i."retiredAt" IS NULL AND ol.id IS NOT NULL)::int AS out,
          count(i.id) FILTER (WHERE i."retiredAt" IS NULL AND i.status = 'IN_REPAIR' AND ol.id IS NULL)::int AS in_repair,
          count(i.id) FILTER (WHERE i."retiredAt" IS NULL AND i.status = 'SURPLUS' AND ol.id IS NULL)::int AS surplus,
          count(i.id) FILTER (WHERE i."retiredAt" IS NOT NULL)::int AS retired
        FROM "ItemType" ty
        LEFT JOIN "Item" i ON i."typeId" = ty.id
        LEFT JOIN "ItemLoan" ol ON ol."itemId" = i.id AND ol."closedAt" IS NULL
        GROUP BY ty.id, ty.name
        ORDER BY ty.name`,
      this.db.$queryRaw<{ total: number; available: number; assigned: number; out: number; retired: number }[]>`
        SELECT count(*)::int AS total,
          count(*) FILTER (WHERE c."retiredAt" IS NULL AND ol.id IS NULL AND an.id IS NULL)::int AS available,
          count(*) FILTER (WHERE c."retiredAt" IS NULL AND ol.id IS NULL AND an.id IS NOT NULL)::int AS assigned,
          count(*) FILTER (WHERE ol.id IS NOT NULL)::int AS out,
          count(*) FILTER (WHERE c."retiredAt" IS NOT NULL AND ol.id IS NULL)::int AS retired
        FROM "BookCopy" c
        LEFT JOIN "BookLoan" ol ON ol."copyId" = c.id AND ol."closedAt" IS NULL
        LEFT JOIN "BookNeed" an ON an."copyId" = c.id AND an.status = 'ASSIGNED'`,
    ]);
    const c = copies[0];
    return {
      tech: tech.map((t) => ({
        typeId: t.id,
        type: t.name,
        available: num(t.available),
        out: num(t.out),
        inRepair: num(t.in_repair),
        surplus: num(t.surplus),
        retired: num(t.retired),
      })),
      copies: { total: num(c?.total), available: num(c?.available), assigned: num(c?.assigned), out: num(c?.out), retired: num(c?.retired) },
    };
  }

  async attention(term: TermRow | null, isAdmin: boolean, now: Date): Promise<AttentionRow[]> {
    const termId = term?.id ?? NO_TERM;
    const code = term?.code ?? '';
    const link = (path: string, view?: string) => {
      const params = new URLSearchParams();
      if (code) params.set('term', code);
      if (view) params.set('view', view);
      const qs = params.toString();
      return qs ? `${path}?${qs}` : path;
    };
    const rows: AttentionRow[] = [];
    const past = term ? isPastTerm(term, now) : false;

    if (term && !past && (await this.db.courseBook.count({ where: { course: { semesterId: termId } } })) === 0) {
      rows.push({ key: 'no-book-list', text: `No book list imported for ${code} yet`, count: 1, tone: 'warn', href: '/admin/imports' });
    }

    // After the return deadline nobody can borrow until the next term's list is imported.
    if (isAdmin && term?.isCurrent && nyDate(now) > term.returnDeadline) {
      const next = await this.db.semester.findFirst({
        where: { id: { not: term.id }, startsOn: { gt: new Date(`${term.startsOn}T00:00:00Z`) } },
        orderBy: { startsOn: 'asc' },
        include: { _count: { select: { members: true } } },
      });
      if (!next) {
        rows.push({ key: 'term-ended', text: `${code} has ended. Add the next term, then import its student list`, count: 1, tone: 'warn', href: '/admin/terms' });
      } else if (next._count.members === 0) {
        rows.push({ key: 'term-ended', text: `${code} has ended. Import ${next.code}'s student list so people can borrow again`, count: 1, tone: 'warn', href: '/admin/imports/students' });
      } else {
        rows.push({ key: 'term-ended', text: `${code} has ended. Make ${next.code} the current term`, count: 1, tone: 'warn', href: '/admin/terms' });
      }
    }

    if (isAdmin) {
      const last = await this.db.importRun.findFirst({ where: { kind: STUDENT_IMPORT_KIND, appliedAt: { not: null } }, orderBy: { appliedAt: 'desc' } });
      const review = num((last?.counts as { review?: number } | null)?.review);
      if (last && review > 0) rows.push({ key: 'import-review', text: 'Import rows to review', count: review, tone: 'warn', href: `/admin/imports/${last.id}` });
    }

    if (term) {
      const pastDueNoReminder = await this.db.borrower.count({
        where: {
          OR: [
            { bookLoans: { some: bookLoanWhere({ semesterId: termId, filter: 'pastdue', now }) } },
            { itemLoans: { some: itemLoanWhere({ semesterId: termId, filter: 'pastdue', now }) } },
          ],
          emails: { none: { status: 'SENT', sentAt: { gte: new Date(`${term.startsOn}T00:00:00Z`) } } },
        },
      });
      rows.push({ key: 'past-due-no-reminder', text: 'Past due with no reminder sent', count: pastDueNoReminder, tone: 'danger', href: link('/checked-out/all', 'pastdue') });
    }

    const previews = await this.db.emailLog.count({ where: { status: 'PREVIEWED' } });
    rows.push({ key: 'reminders-preview', text: 'Reminders waiting for preview', count: previews, tone: 'warn', href: '/reminders' });

    if (term && nyDate(now) > term.returnDeadline && daysBetween(term.returnDeadline, nyDate(now)) > (this.opts.holdGraceDays ?? 0)) {
      const holdList = await this.db.borrower.count({ where: { itemLoans: { some: { semesterId: termId, closedAt: null } } } });
      rows.push({ key: 'hold-list', text: 'Hold list ready: tech still out after the return deadline', count: holdList, tone: 'warn', href: link('/checked-out/items', 'holdlist') });
    }

    if (isAdmin) {
      const pending = await this.db.escalation.count({ where: { semesterId: termId, stage: 'HOLD_PENDING_REVIEW' } });
      rows.push({ key: 'holds-admin', text: 'Holds waiting for an admin', count: pending, tone: 'warn', href: link('/checked-out/items', 'holds') });
    }

    const { shortTitles } = await this.shortages(termId);
    rows.push({ key: 'titles-short', text: 'Titles short', count: shortTitles, tone: 'warn', href: '/student-books' });
    // "Assignments not picked up" waits for its day-count setting, which has no default until the supervisor decides.

    if (isAdmin) {
      const h = await this.backupState(now);
      if (h.stale) {
        const text = h.lastSuccess
          ? `Backup is old · last good backup ${Math.floor((now.getTime() - new Date(h.lastSuccess.at).getTime()) / 3_600_000)} hours ago`
          : 'Backup is old · no backup has succeeded yet';
        rows.push({ key: 'backup-old', text, count: 1, tone: 'danger', href: '/admin/backups' });
      }
    }

    return rows.filter((r) => r.count > 0);
  }

  async activity(): Promise<ActivityRow[]> {
    const entries = await this.db.auditLog.findMany({
      where: { action: { notIn: HIDDEN_FROM_ACTIVITY } },
      include: { user: { select: { name: true } } },
      orderBy: { at: 'desc' },
      take: 20,
    });
    return entries.map((e) => {
      const snap = (e.after ?? e.before) as Record<string, unknown> | null;
      let label = '';
      if (e.entityType === 'Borrower' && typeof snap?.pid === 'string') label = `PID ${maskPid(snap.pid)}`;
      else if (e.entityType === 'Semester' && snap) label = String(snap.code ?? snap.current ?? '');
      else if (e.entityType === 'User' && typeof snap?.username === 'string') label = snap.username;
      else if (e.entityType === 'ImportRun' && snap) label = `${num(snap.created)} created · ${num(snap.updated)} updated`;
      return {
        id: e.id,
        at: e.at.toISOString(),
        user: e.user ? shortName(e.user.name) : 'System',
        action: ACTION_LABEL[e.action] ?? e.action,
        label,
      };
    });
  }

  async imports(): Promise<ImportSummary[]> {
    const kinds = await this.db.importRun.findMany({ where: { appliedAt: { not: null } }, distinct: ['kind'], orderBy: [{ kind: 'asc' }, { appliedAt: 'desc' }], include: { user: true } });
    return kinds.map((r) => {
      const c = (r.counts ?? {}) as Record<string, unknown>;
      return {
        kind: r.kind === STUDENT_IMPORT_KIND ? 'Students' : r.kind,
        at: (r.appliedAt ?? r.createdAt).toISOString(),
        user: shortName(r.user.name),
        created: num(c.created),
        updated: num(c.updated),
        unchanged: num(c.unchanged),
        review: num(c.review),
      };
    });
  }

  private async backupState(now: Date) {
    const [lastSuccess, lastAttempt] = await Promise.all([
      this.db.backupRun.findFirst({ where: { ok: true }, orderBy: { at: 'desc' } }),
      this.db.backupRun.findFirst({ orderBy: { at: 'desc' } }),
    ]);
    const stale = !lastSuccess || now.getTime() - lastSuccess.at.getTime() > this.opts.backupStaleHours * 3_600_000;
    return {
      stale,
      lastSuccess: lastSuccess
        ? { at: lastSuccess.at.toISOString(), location: lastSuccess.location, sizeBytes: lastSuccess.sizeBytes === null ? null : Number(lastSuccess.sizeBytes) }
        : null,
      lastAttempt: lastAttempt ? { at: lastAttempt.at.toISOString(), ok: lastAttempt.ok, message: lastAttempt.message } : null,
    };
  }

  async health(now: Date): Promise<HealthWidget> {
    const [state, size, disk] = await Promise.all([
      this.backupState(now),
      this.db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
      statfs(this.opts.diskPath)
        .catch(() => statfs('.'))
        .then((s) => ({ freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }))
        .catch(() => null),
    ]);
    return {
      ...state,
      staleAfterHours: this.opts.backupStaleHours,
      disk,
      databaseBytes: num(size[0]?.bytes),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
