import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

describe.skipIf(!hasDb)('people, term tags and eligibility', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let desk: Awaited<ReturnType<typeof signIn>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    await makeUser(t.db, 'desk', 'STAFF');
    const fall = await t.db.semester.create({ data: { code: 'FALL26', startsOn: new Date('2026-08-24'), endsOn: new Date('2026-12-11'), returnDeadline: new Date('2026-12-16'), isCurrent: true } });
    const spring = await t.db.semester.create({ data: { code: 'SPRING27', startsOn: new Date('2027-01-11'), endsOn: new Date('2027-05-01'), returnDeadline: new Date('2027-05-06') } });
    const mk = async (key: string, pid: string, kind: 'ATHLETE' | 'STAFF', onScholarship: boolean, terms: string[]) => {
      const b = await t.db.borrower.create({ data: { pid, firstName: 'Fake', lastName: key, kind, onScholarship } });
      ids[key] = b.id;
      for (const id of terms) await t.db.borrowerTerm.create({ data: { borrowerId: b.id, semesterId: id } });
    };
    await mk('Funded', '9300001', 'ATHLETE', true, [fall.id]);
    await mk('Unfunded', '9300002', 'ATHLETE', false, [fall.id]);
    await mk('Outsider', '9300003', 'ATHLETE', true, []);
    await mk('Staffer', '9300004', 'STAFF', false, [fall.id]);
    await mk('Veteran', '9300005', 'ATHLETE', true, [fall.id, spring.id]);
    admin = await signIn(t.app, 'boss');
    desk = await signIn(t.app, 'desk');
  });
  afterAll(() => t.db.$disconnect());

  type Row = { lastName: string; eligibility: string | null; eligibilityTerm: string | null; terms: string[] };
  const byName = (rows: Row[], name: string): Row => {
    const row = rows.find((r) => r.lastName === name);
    if (!row) throw new Error(`no row for ${name}`);
    return row;
  };

  it('judges each person against the current term by default', async () => {
    const { rows } = (await desk.get('/api/borrowers?pageSize=50')).body;
    expect(byName(rows, 'Funded').eligibility).toBe('ELIGIBLE');
    expect(byName(rows, 'Unfunded').eligibility).toBe('NO_SCHOLARSHIP');
    expect(byName(rows, 'Outsider').eligibility).toBe('NOT_IN_TERM');
    expect(byName(rows, 'Staffer').eligibility).toBe('ELIGIBLE');
    expect(byName(rows, 'Funded').eligibilityTerm).toBe('FALL26');
  });

  it('shows every tag a person has earned, newest first', async () => {
    const { rows } = (await desk.get('/api/borrowers?pageSize=50')).body;
    expect(byName(rows, 'Veteran').terms).toEqual(['SPRING27', 'FALL26']);
    expect(byName(rows, 'Outsider').terms).toEqual([]);
  });

  it('filters to the people tagged for a term and judges them against it', async () => {
    const spring = (await desk.get('/api/borrowers?term=SPRING27')).body;
    expect(spring.rows.map((r: { lastName: string }) => r.lastName)).toEqual(['Veteran']);
    expect(spring.rows[0].eligibilityTerm).toBe('SPRING27');
    expect((await desk.get('/api/borrowers?term=FALL26')).body.total).toBe(4);
  });

  it('search carries eligibility too, for any term asked', async () => {
    const r = (await desk.get('/api/borrowers/search?q=9300003')).body;
    expect(r.matches[0]).toMatchObject({ eligibility: 'NOT_IN_TERM', eligibilityTerm: 'FALL26' });
    const s = (await desk.get('/api/borrowers/search?q=9300005&term=SPRING27')).body;
    expect(s.matches[0]).toMatchObject({ eligibility: 'ELIGIBLE', eligibilityTerm: 'SPRING27' });
  });

  it('the person page reports eligibility for the current term', async () => {
    const p = (await desk.get(`/api/borrowers/${ids.Unfunded}`)).body;
    expect(p).toMatchObject({ eligibility: 'NO_SCHOLARSHIP', eligibilityTerm: 'FALL26', terms: ['FALL26'], onScholarship: false });
  });

  it('an admin sets a person\'s tags by hand, audited with before and after', async () => {
    const body = { pid: '9300003', firstName: 'Fake', lastName: 'Outsider', kind: 'ATHLETE', teamId: null, email: '', phone: '', onScholarship: true, termCodes: ['FALL26', 'SPRING27'] };
    const res = await admin.put(`/api/borrowers/${ids.Outsider}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.terms).toEqual(['SPRING27', 'FALL26']);
    expect(res.body.eligibility).toBe('ELIGIBLE');
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { action: 'borrower.update', entityId: ids.Outsider } });
    expect(entry.before).toMatchObject({ terms: [] });
    expect(entry.after).toMatchObject({ terms: ['FALL26', 'SPRING27'] });

    const removed = await admin.put(`/api/borrowers/${ids.Outsider}`).send({ ...body, termCodes: ['FALL26'] });
    expect(removed.body.terms).toEqual(['FALL26']);
  });

  it('rejects an unknown term, and staff cannot edit people', async () => {
    const body = { pid: '9300003', firstName: 'Fake', lastName: 'Outsider', kind: 'ATHLETE', teamId: null, email: '', phone: '', onScholarship: true, termCodes: ['FALL99'] };
    expect((await admin.put(`/api/borrowers/${ids.Outsider}`).send(body)).status).toBe(400);
    expect((await desk.put(`/api/borrowers/${ids.Outsider}`).send({ ...body, termCodes: [] })).status).toBe(403);
  });

  it('adds a late person with a term tag', async () => {
    const res = await admin.post('/api/borrowers').send({ pid: '9300009', firstName: 'Late', lastName: 'Addition', kind: 'ATHLETE', teamId: null, email: '', phone: '', onScholarship: true, termCodes: ['FALL26'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ terms: ['FALL26'], eligibility: 'ELIGIBLE' });
  });
});
