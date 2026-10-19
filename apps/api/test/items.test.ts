import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItemHistory, ItemMatch } from '@saac/shared';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

describe.skipIf(!hasDb)('item lookup and history', () => {
  let t: TestApp;
  let desk: Awaited<ReturnType<typeof signIn>>;
  const day = (n: number) => new Date(Date.now() + n * 86_400_000);

  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'desk', 'STAFF');
    const term = await t.db.semester.create({ data: { code: 'FALL26', startsOn: day(-60), endsOn: day(40), returnDeadline: day(45), isCurrent: true } });
    const old = await t.db.semester.create({ data: { code: 'SPRING26', startsOn: day(-250), endsOn: day(-150), returnDeadline: day(-145) } });
    const laptops = await t.db.itemType.create({ data: { name: 'Laptops' } });
    const chargers = await t.db.itemType.create({ data: { name: 'Chargers' } });
    const a = await t.db.borrower.create({ data: { pid: '9500001', firstName: 'Fake', lastName: 'Earlier' } });
    const b = await t.db.borrower.create({ data: { pid: '9500002', firstName: 'Fake', lastName: 'Holder' } });
    const laptop = await t.db.item.create({ data: { assetTag: 'L-0942', name: 'SAAC Laptop 942', typeId: laptops.id } });
    await t.db.item.create({ data: { assetTag: 'H-0941', name: 'Charger 941', typeId: chargers.id, status: 'IN_REPAIR', statusNote: 'Frayed cable' } });
    await t.db.item.create({ data: { assetTag: 'L-0100', name: 'SAAC Laptop 100', typeId: laptops.id, retiredAt: day(-10) } });
    await t.db.itemLoan.create({ data: { borrowerId: a.id, itemId: laptop.id, semesterId: old.id, checkedOutAt: day(-240), dueDate: day(-145), closedAt: day(-146), outcome: 'RETURNED', conditionIn: 'Good' } });
    await t.db.itemLoan.create({ data: { borrowerId: b.id, itemId: laptop.id, semesterId: term.id, checkedOutAt: day(-50), dueDate: day(-1), conditionOut: 'Scratched lid' } });
    const book = await t.db.book.create({ data: { isbn: '9780306406157', title: 'Fake Book' } });
    await t.db.bookCopy.create({ data: { copyTag: 'C-00001', bookId: book.id } });
    desk = await signIn(t.app, 'desk');
  });
  afterAll(() => t.db.$disconnect());

  const lookup = async (q: string) => (await desk.get(`/api/items/lookup?q=${encodeURIComponent(q)}`)).body as ItemMatch[];

  it('finds tech by name words or by tag, and says who has it', async () => {
    const [hit, ...rest] = await lookup('laptop 942');
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({ kind: 'tech', tag: 'SAAC Laptop 942', state: 'OUT', pastDue: true, holder: { pid: '9500002', lastName: 'Holder' } });
    expect((await lookup('l-0942'))[0]?.tag).toBe('SAAC Laptop 942');
  });

  it('gives the saved identifier for the barcode, and a scanned identifier finds only its own item', async () => {
    await t.db.item.create({ data: { assetTag: 'L-09420', name: 'SAAC Laptop 9420', typeId: (await t.db.itemType.findFirstOrThrow({ where: { name: 'Laptops' } })).id } });
    const exact = await lookup('l-0942');
    expect(exact.map((i) => i.code)).toEqual(['L-0942']);
    expect((await lookup('L-094')).map((i) => i.code).sort()).toEqual(['L-0942', 'L-09420']);
    expect((await lookup('C-00001'))[0]?.code).toBe('C-00001');
    expect(await lookup('NOSUCHTAG99')).toEqual([]);
  });

  it('finds a book title by the ISBN on its cover, for any signed-in user', async () => {
    const res = await desk.get('/api/items/isbn/0-306-40615-2'); // the ISBN-10 of the same book
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Fake Book', isbn: '9780306406157', counts: { total: 1, available: 1, out: 0 } });
    const unknown = await desk.get('/api/items/isbn/9780131103627');
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Barcode not recognized. Please try again.');
    expect((await desk.get('/api/items/isbn/12345')).status).toBe(400);
  });

  it('derives the state: in repair, retired, available', async () => {
    expect((await lookup('charger 941'))[0]).toMatchObject({ state: 'IN_REPAIR', holder: null });
    expect((await lookup('L-0100'))[0]).toMatchObject({ state: 'RETIRED' });
    expect((await lookup('C-00001'))[0]).toMatchObject({ kind: 'book', name: 'Fake Book', state: 'AVAILABLE' });
  });

  it('shows the whole history, newest first', async () => {
    const id = (await lookup('L-0942'))[0]!.id;
    const h = (await desk.get(`/api/items/tech/${id}`)).body as ItemHistory;
    expect(h.holder?.lastName).toBe('Holder');
    expect(h.loans.map((l) => [l.borrower.lastName, l.termCode, l.outcome])).toEqual([
      ['Holder', 'FALL26', null],
      ['Earlier', 'SPRING26', 'RETURNED'],
    ]);
    expect(h.loans[0]?.conditionOut).toBe('Scratched lid');
  });

  it('needs a signed-in user, and ignores a one-letter query', async () => {
    expect((await request(t.app).get('/api/items/lookup?q=laptop')).status).toBe(401);
    expect(await lookup('l')).toEqual([]);
  });
});
