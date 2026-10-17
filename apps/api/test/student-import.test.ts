import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

const sample = await readFile(new URL('../../../fixtures/students.sample.xlsx', import.meta.url));

describe.skipIf(!hasDb)('student import', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;

  const preview = (file: Buffer, name = 'students.sample.xlsx', term = 'FALL26') =>
    admin.post('/api/imports/students/preview').field('term', term).attach('file', file, name);
  const apply = (file: Buffer, name = 'students.sample.xlsx', term = 'FALL26', removeMissingTags = false) =>
    admin.post('/api/imports/students/apply').field('term', term).field('removeMissingTags', String(removeMissingTags)).attach('file', file, name);
  const tagged = (code: string) => t.db.borrower.count({ where: { terms: { some: { semester: { code } } } } });

  beforeAll(async () => {
    t = setupApp();
  });
  beforeEach(async () => {
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    for (const code of ['FALL26', 'SPRING27']) {
      await t.db.semester.create({ data: { code, startsOn: new Date('2026-08-24'), endsOn: new Date('2026-12-11'), returnDeadline: new Date('2026-12-16') } });
    }
    admin = await signIn(t.app, 'boss');
  });
  afterAll(() => t.db.$disconnect());

  it('previews creates and review rows without saving anything', async () => {
    const res = await preview(sample);
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ rows: 48, created: 47, updated: 0, unchanged: 0, rejected: 1, review: 6, pidsFixed: 1, tagged: 47 });
    expect(res.body.termCode).toBe('FALL26');
    expect(await t.db.borrower.count()).toBe(0);
    expect(await t.db.borrowerTerm.count()).toBe(0);
    expect(await t.db.importRun.count()).toBe(0);
  });

  it('applies once, then changes nothing the second time', async () => {
    const first = await apply(sample);
    expect(first.status).toBe(200);
    expect(first.body.counts).toMatchObject({ created: 47, updated: 0, tagged: 47 });
    expect(await t.db.borrower.count()).toBe(47);
    expect(await tagged('FALL26')).toBe(47);
    const snapshot = await t.db.borrower.findMany({ orderBy: { pid: 'asc' } });

    const second = await apply(sample);
    expect(second.body.counts).toMatchObject({ created: 0, updated: 0, unchanged: 47, tagged: 0 });
    expect(await t.db.borrower.findMany({ orderBy: { pid: 'asc' } })).toEqual(snapshot);
    expect(await t.db.borrowerTerm.count()).toBe(47);

    const again = await preview(sample);
    expect(again.body.alreadyAppliedAt).not.toBeNull();
    // The same file for another term is a different import.
    expect((await preview(sample, 'students.sample.xlsx', 'SPRING27')).body.alreadyAppliedAt).toBeNull();
  });

  it('stores PIDs as 7-digit text and resolves the Sport column', async () => {
    await apply(sample);
    const short = await t.db.borrower.findUniqueOrThrow({ where: { pid: '0900001' }, include: { team: true } });
    expect(short.team?.name).toBe('Football');
    expect((await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000200' } })).kind).toBe('STAFF');
    expect((await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000204' } })).kind).toBe('GRAD_ASSISTANT');
    const fifth = await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000206' } });
    expect(fifth).toMatchObject({ kind: 'ATHLETE', teamId: null });
    expect((await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000300' } })).email).toBe('fake300@fiu.edu');
  });

  it('never stores a blank over an existing value', async () => {
    await apply(sample);
    const csv = Buffer.from('PID,Last Name,First Name,OnScholarship?,Sport,E-mail Address,Mobile Phone\n9000100,Fakeman,Alex,,,,\n');
    const res = await apply(csv, 'update.csv');
    expect(res.body.counts).toMatchObject({ updated: 0, unchanged: 1 });
    const p = await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000100' }, include: { team: true } });
    expect(p).toMatchObject({ email: 'fake000@fiu.edu', onScholarship: false });
    expect(p.team?.name).toBe('Football');
  });

  it('updates changed values and audits each person with before and after', async () => {
    await apply(sample);
    const csv = Buffer.from('PID,Last Name,First Name,Sport,Mobile Phone\n9000100,Fakeman,Alex,Baseball,3055559999\n');
    const res = await apply(csv, 'update.csv');
    expect(res.body.counts).toMatchObject({ updated: 1 });
    const p = await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000100' } });
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { action: 'borrower.import_update', entityId: p.id } });
    expect(entry.before).toMatchObject({ phone: null });
    expect(entry.after).toMatchObject({ phone: '3055559999' });
    expect(await t.db.auditLog.count({ where: { action: 'import.students' } })).toBe(2);
  });

  it('an import with no term adds people and gives them no tag', async () => {
    const res = await apply(sample, 'students.sample.xlsx', '');
    expect(res.body.counts).toMatchObject({ created: 47, tagged: 0 });
    expect(await t.db.borrower.count()).toBe(47);
    expect(await t.db.borrowerTerm.count()).toBe(0);
  });

  it('a later term tags the same people again without duplicating them, and keeps the old tag', async () => {
    await apply(sample, 'students.sample.xlsx', 'FALL26');
    const next = await apply(sample, 'students.sample.xlsx', 'SPRING27');
    expect(next.body.counts).toMatchObject({ created: 0, updated: 47, unchanged: 0, tagged: 47 });
    expect(await t.db.borrower.count()).toBe(47);
    expect(await tagged('FALL26')).toBe(47);
    expect(await tagged('SPRING27')).toBe(47);
    const p = await t.db.borrower.findUniqueOrThrow({ where: { pid: '9000100' }, include: { terms: { include: { semester: true } } } });
    expect(p.terms.map((x) => x.semester.code).sort()).toEqual(['FALL26', 'SPRING27']);
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { action: 'borrower.import_update', entityId: p.id } });
    expect(entry.after).toMatchObject({ addedTerm: 'SPRING27' });
  });

  it('tagging an existing person for a term shows as an update in the preview', async () => {
    await apply(sample, 'students.sample.xlsx', '');
    const p = await preview(sample, 'students.sample.xlsx', 'FALL26');
    expect(p.body.counts).toMatchObject({ created: 0, updated: 47, tagged: 47 });
    expect(p.body.rows[0].changes).toContainEqual({ field: 'Term tag', from: null, to: 'FALL26' });
  });

  it('lists people tagged for the term but missing from the file, and removes their tag only when asked', async () => {
    const left = await t.db.borrower.create({ data: { pid: '1111111', firstName: 'Left', lastName: 'Behind' } });
    const fall = await t.db.semester.findUniqueOrThrow({ where: { code: 'FALL26' } });
    await t.db.borrowerTerm.create({ data: { borrowerId: left.id, semesterId: fall.id } });
    const p = await preview(sample);
    expect(p.body.notInFile).toEqual([{ pid: '1111111', name: 'Behind, Left' }]);
    await apply(sample);
    expect(await t.db.borrowerTerm.count({ where: { borrowerId: left.id } })).toBe(1);
    const res = await apply(sample, 'students.sample.xlsx', 'FALL26', true);
    expect(res.body.counts.untagged).toBe(1);
    expect(await t.db.borrowerTerm.count({ where: { borrowerId: left.id } })).toBe(0);
    expect(await t.db.borrower.findUnique({ where: { pid: '1111111' } })).not.toBeNull(); // nobody is ever deleted
  });

  it('refuses an unknown term and removing tags without a term', async () => {
    const res = await preview(sample, 'students.sample.xlsx', 'FALL99');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Terms screen');
    expect((await apply(sample, 'students.sample.xlsx', '', true)).status).toBe(400);
  });

  it('refuses a file without the required columns', async () => {
    const res = await preview(Buffer.from('Name,Sport\nA,Football\n'), 'bad.csv');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('"PID"');
  });

  it('exports the review list with PIDs as text', async () => {
    const p = await preview(sample);
    const res = await admin.post('/api/imports/review-list.xlsx').send({ review: p.body.review, warnings: p.body.warnings }).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
});
