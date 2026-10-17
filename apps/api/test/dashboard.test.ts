import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DashboardResponse } from '@saac/shared';
import type { Db } from '../src/db';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

const day = 86_400_000;
const future = new Date(Date.now() + 30 * day);
const past = new Date(Date.now() - 3 * day);

/** A small, fully known world of fake data. */
async function buildFixtures(db: Db) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const term = await db.semester.create({
    data: { code: 'FALL26', startsOn: new Date(today.getTime() - 60 * day), endsOn: new Date(today.getTime() + 40 * day), returnDeadline: new Date(`${iso(new Date(today.getTime() + 45 * day))}T00:00:00Z`), isCurrent: true },
  });
  const old = await db.semester.create({
    data: { code: 'SPRING26', startsOn: new Date(today.getTime() - 240 * day), endsOn: new Date(today.getTime() - 150 * day), returnDeadline: new Date(today.getTime() - 145 * day) },
  });
  const football = await db.team.findUniqueOrThrow({ where: { name: 'Football' } });
  const baseball = await db.team.findUniqueOrThrow({ where: { name: 'Baseball' } });
  // `inTerm` is the FALL26 tag. Not-in-term people exist on file but are not counted for the term.
  const mk = async (pid: string, teamId: string | null, kind: 'ATHLETE' | 'STAFF' | 'GRAD_ASSISTANT' = 'ATHLETE', inTerm = true) => {
    const b = await db.borrower.create({ data: { pid, firstName: 'Fake', lastName: `Person${pid}`, kind, teamId, onScholarship: kind === 'ATHLETE' } });
    if (inTerm) await db.borrowerTerm.create({ data: { borrowerId: b.id, semesterId: term.id } });
    return b;
  };
  const [a1, a2, a3, a4, a5] = await Promise.all([mk('9100001', football.id), mk('9100002', football.id), mk('9100003', football.id), mk('9100004', baseball.id), mk('9100005', baseball.id)]);
  await mk('9100006', null, 'STAFF');
  await mk('9100007', null, 'GRAD_ASSISTANT');
  await mk('9100008', football.id, 'ATHLETE', false);

  const laptops = await db.itemType.create({ data: { name: 'Laptops' } });
  const item = (tag: string, extra: object = {}) => db.item.create({ data: { assetTag: tag, name: tag, typeId: laptops.id, ...extra } });
  const [l1, l2] = await Promise.all([item('L-1'), item('L-2'), item('L-3', { status: 'IN_REPAIR' }), item('L-4', { retiredAt: new Date() }), item('L-5'), item('L-6', { status: 'SURPLUS' })]);
  await db.itemLoan.create({ data: { borrowerId: a1!.id, itemId: l1!.id, semesterId: term.id, dueDate: future } });
  await db.itemLoan.create({ data: { borrowerId: a4!.id, itemId: l2!.id, semesterId: term.id, dueDate: past } });

  const book = await db.book.create({ data: { isbn: '9780306406157', title: 'Fake Book' } });
  const shortBook = await db.book.create({ data: { isbn: '9780306406164', title: 'Short Book' } });
  const copy = (tag: string, extra: object = {}) => db.bookCopy.create({ data: { copyTag: tag, bookId: book.id, ...extra } });
  const [c1, c2, c3, c4] = await Promise.all([copy('C-1'), copy('C-2'), copy('C-3'), copy('C-4'), copy('C-5', { retiredAt: new Date() })]);
  const course = await db.course.create({ data: { semesterId: term.id, subject: 'COP', catalog: '3530', section: 'U01' } });
  await db.courseBook.create({ data: { courseId: course.id, bookId: book.id } });
  await db.bookLoan.create({ data: { borrowerId: a1!.id, copyId: c1!.id, semesterId: term.id, dueDate: future } });
  await db.bookLoan.create({ data: { borrowerId: a2!.id, copyId: c2!.id, semesterId: term.id, dueDate: past } });
  await db.bookLoan.create({ data: { borrowerId: a3!.id, copyId: c4!.id, semesterId: term.id, dueDate: future, closedAt: new Date(), outcome: 'RETURNED' } });
  await db.bookNeed.create({ data: { borrowerId: a5!.id, semesterId: term.id, bookId: book.id, status: 'ASSIGNED', copyId: c3!.id, source: 'MANUAL' } });
  await db.bookNeed.create({ data: { borrowerId: a5!.id, semesterId: term.id, bookId: shortBook.id, status: 'NEEDED', source: 'MANUAL' } });
  await db.bookNeed.create({ data: { borrowerId: a3!.id, semesterId: term.id, bookId: shortBook.id, status: 'WAIVED', source: 'MANUAL' } });

  await db.escalation.create({ data: { borrowerId: a4!.id, semesterId: term.id, stage: 'HOLD_PENDING_REVIEW' } });
  await db.escalation.create({ data: { borrowerId: a2!.id, semesterId: term.id, stage: 'ON_HOLD' } });
  await db.escalation.create({ data: { borrowerId: a3!.id, semesterId: old.id, stage: 'ON_HOLD' } });

  await db.backupRun.create({ data: { at: new Date(Date.now() - 3_600_000), ok: true, location: 'test' } });
  return { term, football };
}

const data = <T>(w: { ok: true; data: T } | { ok: false; error: string } | undefined): T => {
  if (!w || !w.ok) throw new Error(`widget failed: ${JSON.stringify(w)}`);
  return w.data;
};

describe.skipIf(!hasDb)('dashboard', () => {
  let t: TestApp;
  let fx: Awaited<ReturnType<typeof buildFixtures>>;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let desk: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    await makeUser(t.db, 'desk', 'STAFF');
    fx = await buildFixtures(t.db);
    admin = await signIn(t.app, 'boss');
    desk = await signIn(t.app, 'desk');
  });
  afterAll(() => t.db.$disconnect());

  const load = async (who = admin, term = '') => {
    const res = await who.get(`/api/dashboard${term ? `?term=${term}` : ''}`);
    expect(res.status).toBe(200);
    return res.body as DashboardResponse;
  };

  it('defaults to the current term', async () => {
    const d = await load();
    expect(d.term?.code).toBe('FALL26');
    expect(d.terms.map((x) => x.code)).toEqual(['FALL26', 'SPRING26']);
    expect(d.isPast).toBe(false);
  });

  it('each tile equals a direct count query', async () => {
    const d = await load();
    const w = d.widgets;
    const sql = async (q: string) => Number((await t.db.$queryRawUnsafe<{ n: bigint }[]>(q))[0]!.n);
    const tid = fx.term.id;
    const inTerm = `"Borrower" b JOIN "BorrowerTerm" t ON t."borrowerId" = b.id WHERE t."semesterId" = '${tid}'`;
    expect(data(w.people)).toEqual({
      total: await sql(`SELECT count(*) n FROM ${inTerm}`),
      athletes: await sql(`SELECT count(*) n FROM ${inTerm} AND b.kind = 'ATHLETE'`),
      staff: await sql(`SELECT count(*) n FROM ${inTerm} AND b.kind <> 'ATHLETE'`),
    });
    expect(data(w.booksOut)).toBe(await sql(`SELECT count(*) n FROM "BookLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL`));
    expect(data(w.techOut)).toBe(await sql(`SELECT count(*) n FROM "ItemLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL`));
    expect(data(w.pastDue).total).toBe(
      (await sql(`SELECT count(*) n FROM "BookLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL AND "dueDate" < now()`)) +
        (await sql(`SELECT count(*) n FROM "ItemLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL AND "dueDate" < now()`)),
    );
    expect(data(w.holds)).toEqual({ total: 2, pending: 1, onHold: 1 });
    expect(data(w.deadline)?.peopleHolding).toBe(
      await sql(`SELECT count(DISTINCT b) n FROM (SELECT "borrowerId" b FROM "BookLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL UNION SELECT "borrowerId" FROM "ItemLoan" WHERE "semesterId" = '${tid}' AND "closedAt" IS NULL) x`),
    );
    expect(data(w.deadline)?.daysLeft).toBeGreaterThan(40);
    // Known values for the fixture, as a second check.
    expect(data(w.people)).toEqual({ total: 7, athletes: 5, staff: 2 }); // the 8th person is on file but has no FALL26 tag
    expect(data(w.booksOut)).toBe(2);
    expect(data(w.techOut)).toBe(2);
    expect(data(w.pastDue)).toEqual({ total: 2, books: 1, tech: 1 });
  });

  it('every tile number opens a list with exactly those rows', async () => {
    const w = (await load()).widgets;
    expect((await admin.get('/api/borrowers?term=FALL26&pageSize=200')).body.total).toBe(data(w.people).total);
    expect((await admin.get('/api/loans/books')).body.rows).toHaveLength(data(w.booksOut));
    expect((await admin.get('/api/loans/items')).body.rows).toHaveLength(data(w.techOut));
    const pastDue = (await admin.get('/api/loans/all?view=pastdue')).body.rows;
    expect(pastDue).toHaveLength(data(w.pastDue).total);
    expect(pastDue.every((r: { pastDue: boolean }) => r.pastDue)).toBe(true);
    expect((await admin.get('/api/loans/items?view=holds')).body.holds).toHaveLength(data(w.holds).total);
    expect((await admin.get('/api/borrowers?holding=FALL26&pageSize=200')).body.total).toBe(data(w.deadline)!.peopleHolding);
    // The people list for the term also shows a past term's own tags, not the current one's.
    expect((await admin.get('/api/borrowers?term=SPRING26&pageSize=200')).body.total).toBe(0);
  });

  it('team progress, books and inventory match the fixture', async () => {
    const w = (await load()).widgets;
    const fb = data(w.teams).find((r) => r.name === 'Football');
    expect(fb).toMatchObject({ total: 4, returned: 1, out: 2, pastDue: 1, peopleWithItems: 2 });
    expect((await admin.get(`/api/loans/all?teamId=${fx.football.id}`)).body.rows).toHaveLength(fb!.out + fb!.pastDue);
    expect(data(w.books)).toEqual({ hasBookList: true, needed: 1, assigned: 1, issued: 0, waived: 1, shortTitles: 1, shortNeeds: 1 });
    expect(data(w.inventory).tech).toEqual([{ typeId: expect.any(String), type: 'Laptops', available: 1, out: 2, inRepair: 1, surplus: 1, retired: 1 }]);
    expect(data(w.inventory).copies).toEqual({ total: 5, available: 1, assigned: 1, out: 2, retired: 1 });
  });

  it('the attention queue only lists rows above zero', async () => {
    const rows = data((await load()).widgets.attention!);
    expect(rows.every((r) => r.count > 0)).toBe(true);
    expect(rows.find((r) => r.key === 'past-due-no-reminder')?.count).toBe(2);
    expect(rows.find((r) => r.key === 'holds-admin')?.count).toBe(1);
    expect(rows.find((r) => r.key === 'titles-short')?.count).toBe(1);
    expect(rows.find((r) => r.key === 'backup-old')).toBeUndefined();
  });

  it('staff see recent activity but not the attention queue, imports or system health', async () => {
    const d = await load(desk);
    expect(d.isAdmin).toBe(false);
    expect(d.widgets.activity?.ok).toBe(true);
    expect(d.widgets.attention).toBeUndefined();
    expect(d.widgets.imports).toBeUndefined();
    expect(d.widgets.health).toBeUndefined();
  });

  it('one failing widget leaves the others working', async () => {
    const original = t.services.dashboard.inventory;
    t.services.dashboard.inventory = async () => {
      throw new Error('simulated failure');
    };
    try {
      const d = await load();
      expect(d.widgets.inventory.ok).toBe(false);
      expect(d.widgets.people.ok && d.widgets.teams.ok && d.widgets.health?.ok).toBe(true);
    } finally {
      t.services.dashboard.inventory = original;
    }
  });

  it('a stale backup turns system health red and joins the attention queue', async () => {
    await t.db.backupRun.deleteMany();
    await t.db.backupRun.create({ data: { at: new Date(Date.now() - 40 * 3_600_000), ok: true, location: 'test' } });
    await t.db.backupRun.create({ data: { at: new Date(Date.now() - 3_600_000), ok: false, location: 'test', message: 'disk full' } });
    const d = await load();
    expect(data(d.widgets.health).stale).toBe(true);
    expect(data(d.widgets.health).lastAttempt?.ok).toBe(false);
    expect(data(d.widgets.attention!).find((r) => r.key === 'backup-old')?.tone).toBe('danger');
  });

  it('recent activity shows no contact details to staff either', async () => {
    const rows = data((await load(desk)).widgets.activity);
    expect(JSON.stringify(rows)).not.toMatch(/@|\b\d{10}\b/);
  });

  it('a past term is flagged read-only and scopes its numbers', async () => {
    const d = await load(admin, 'SPRING26');
    expect(d.isPast).toBe(true);
    expect(data(d.widgets.holds)).toEqual({ total: 1, pending: 0, onHold: 1 });
    expect(data(d.widgets.booksOut)).toBe(0);
  });

  it('recent activity masks PIDs and hides contact details', async () => {
    await admin.put(`/api/borrowers/${(await t.db.borrower.findFirstOrThrow({ where: { pid: '9100001' } })).id}`).send({
      pid: '9100001', firstName: 'Fake', lastName: 'Renamed', kind: 'ATHLETE', teamId: fx.football.id, email: 'x@example.edu', phone: '3055551234', onScholarship: true, termCodes: ['FALL26'],
    });
    const rows = data((await load()).widgets.activity);
    expect(rows[0]).toMatchObject({ action: 'Edited person', label: 'PID 9•••••1' });
    expect(JSON.stringify(rows)).not.toContain('x@example.edu');
  });

  it('loads the full 3,161-person table quickly', async () => {
    await t.db.borrower.createMany({
      data: Array.from({ length: 3161 }, (_, i) => ({ id: `bulk-${i}`, pid: String(9200000 + i), firstName: 'Bulk', lastName: `Fake${i}` })),
    });
    await t.db.borrowerTerm.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ borrowerId: `bulk-${i}`, semesterId: fx.term.id })) });
    const started = Date.now();
    await load();
    expect(Date.now() - started).toBeLessThan(2000);
    const s = Date.now();
    const res = await admin.get('/api/borrowers/search?q=fake12');
    expect(Date.now() - s).toBeLessThan(1000);
    expect(res.body.matches.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)('search', () => {
  let t: TestApp;
  let desk: Awaited<ReturnType<typeof signIn>>;
  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'desk', 'STAFF');
    await t.db.borrower.create({ data: { pid: '0123456', firstName: 'Fake', lastName: 'Zeroman' } });
    desk = await signIn(t.app, 'desk');
  });
  afterAll(() => t.db.$disconnect());

  it('finds by full PID, suggests the zero for 6 digits, and finds by name', async () => {
    expect((await desk.get('/api/borrowers/search?q=0123456')).body).toMatchObject({ kind: 'pid', matches: [{ lastName: 'Zeroman' }] });
    expect((await desk.get('/api/borrowers/search?q=123456')).body).toMatchObject({ kind: 'pid-short', suggestedPid: '0123456', matches: [{ pid: '0123456' }] });
    expect((await desk.get('/api/borrowers/search?q=zero fa')).body.matches).toHaveLength(1);
    expect((await desk.get('/api/borrowers/search?q=L-0044')).body.kind).toBe('tag');
    expect((await desk.get('/api/borrowers/search?q=99999999')).body).toMatchObject({ kind: 'digits', matches: [] });
  });
});

describe.skipIf(!hasDb)('after the return deadline', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let desk: Awaited<ReturnType<typeof signIn>>;
  const day = (n: number) => new Date(Date.now() + n * 86_400_000);

  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    await makeUser(t.db, 'desk', 'STAFF');
    await t.db.semester.create({ data: { code: 'FALL26', startsOn: day(-120), endsOn: day(-10), returnDeadline: day(-3), isCurrent: true } });
    admin = await signIn(t.app, 'boss');
    desk = await signIn(t.app, 'desk');
  });
  afterAll(() => t.db.$disconnect());

  const row = async (who = admin) => {
    const d = (await who.get('/api/dashboard')).body as DashboardResponse;
    return d.widgets.attention ? data(d.widgets.attention).find((r) => r.key === 'term-ended') : undefined;
  };

  it('tells an admin what to do next, step by step', async () => {
    expect(await row()).toMatchObject({ text: 'FALL26 has ended. Add the next term, then import its student list', href: '/admin/terms' });

    const next = await t.db.semester.create({ data: { code: 'SPRING27', startsOn: day(30), endsOn: day(130), returnDeadline: day(135) } });
    expect(await row()).toMatchObject({ text: "FALL26 has ended. Import SPRING27's student list so people can borrow again", href: '/admin/imports/students' });

    const p = await t.db.borrower.create({ data: { pid: '9400001', firstName: 'Fake', lastName: 'Tagged', onScholarship: true } });
    await t.db.borrowerTerm.create({ data: { borrowerId: p.id, semesterId: next.id } });
    expect(await row()).toMatchObject({ text: 'FALL26 has ended. Make SPRING27 the current term', href: '/admin/terms' });
  });

  it('goes away once the next term is current, and staff never see it', async () => {
    expect(await row(desk)).toBeUndefined();
    const next = await t.db.semester.findUniqueOrThrow({ where: { code: 'SPRING27' } });
    expect((await admin.post(`/api/terms/${next.id}/current`)).status).toBe(200);
    expect(await row()).toBeUndefined();
  });
});
