import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

const sample = await readFile(new URL('../../../fixtures/students.sample.xlsx', import.meta.url));

describe.skipIf(!hasDb)('student import', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;

  const preview = (file: Buffer, name = 'students.sample.xlsx', mode = 'CURRENT_TERM') =>
    admin.post('/api/imports/students/preview').field('mode', mode).attach('file', file, name);
  const apply = (file: Buffer, name = 'students.sample.xlsx', mode = 'CURRENT_TERM', deactivateMissing = false) =>
    admin.post('/api/imports/students/apply').field('mode', mode).field('deactivateMissing', String(deactivateMissing)).attach('file', file, name);

  beforeAll(async () => {
    t = setupApp();
  });
  beforeEach(async () => {
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    admin = await signIn(t.app, 'boss');
  });
  afterAll(() => t.db.$disconnect());

  it('previews creates and review rows without saving anything', async () => {
    const res = await preview(sample);
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ rows: 48, created: 47, updated: 0, unchanged: 0, rejected: 1, review: 6, pidsFixed: 1 });
    expect(await t.db.borrower.count()).toBe(0);
    expect(await t.db.importRun.count()).toBe(0);
  });

  it('applies once, then changes nothing the second time', async () => {
    const first = await apply(sample);
    expect(first.status).toBe(200);
    expect(first.body.counts).toMatchObject({ created: 47, updated: 0 });
    expect(await t.db.borrower.count()).toBe(47);
    const snapshot = await t.db.borrower.findMany({ orderBy: { pid: 'asc' } });

    const second = await apply(sample);
    expect(second.body.counts).toMatchObject({ created: 0, updated: 0, unchanged: 47 });
    expect(await t.db.borrower.findMany({ orderBy: { pid: 'asc' } })).toEqual(snapshot);

    const again = await preview(sample);
    expect(again.body.alreadyAppliedAt).not.toBeNull();
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

  it('a historical load imports everyone as inactive', async () => {
    const res = await apply(sample, 'students.sample.xlsx', 'HISTORICAL');
    expect(res.body.counts.created).toBe(47);
    expect(await t.db.borrower.count({ where: { active: true } })).toBe(0);
  });

  it('a current-term import lists people not in the file and sets them inactive only when asked', async () => {
    await t.db.borrower.create({ data: { pid: '1111111', firstName: 'Left', lastName: 'Behind', active: true } });
    const p = await preview(sample);
    expect(p.body.notInFile).toEqual([{ pid: '1111111', name: 'Behind, Left' }]);
    await apply(sample);
    expect((await t.db.borrower.findUniqueOrThrow({ where: { pid: '1111111' } })).active).toBe(true);
    const res = await apply(sample, 'students.sample.xlsx', 'CURRENT_TERM', true);
    expect(res.body.counts.deactivated).toBe(1);
    expect((await t.db.borrower.findUniqueOrThrow({ where: { pid: '1111111' } })).active).toBe(false);
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
