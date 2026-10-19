import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BookDetail, BookListResponse, InventoryItemRow, ItemHistory, ItemTypeRow } from '@saac/shared';
import { hasDb, makeUser, resetDb, setupApp, signIn, type TestApp } from './helpers';

describe.skipIf(!hasDb)('inventory: tech items', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let desk: Awaited<ReturnType<typeof signIn>>;
  let laptops: string;

  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    await makeUser(t.db, 'desk', 'STAFF');
    admin = await signIn(t.app, 'boss');
    desk = await signIn(t.app, 'desk');
    laptops = (await admin.post('/api/item-types').send({ name: 'Laptops' })).body.id;
  });
  afterAll(() => t.db.$disconnect());

  const items = async (q = '') => (await admin.get(`/api/items${q}`)).body as InventoryItemRow[];
  const byTag = async (tag: string) => (await items()).find((i) => i.assetTag === tag)!;

  it('saves the tag without spaces as the only identifier, and refuses a taken tag in any case', async () => {
    const res = await admin.post('/api/items').send({ typeId: laptops, tag: ' SAAC  Laptop 942 ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'SAACLaptop942', assetTag: 'SAACLaptop942' });
    expect((await admin.post('/api/items').send({ typeId: laptops, tag: 'saaclaptop942' })).status).toBe(409);
    expect((await admin.post('/api/items').send({ typeId: laptops, tag: 'SAAC #1' })).status).toBe(400);
    expect((await byTag('SAACLaptop942')).state).toBe('AVAILABLE');
    expect((await items('?q=SAACLaptop942')).length).toBe(1);
  });

  it('adds a numbered run all at once, or none if a tag is taken', async () => {
    const res = await admin.post('/api/items/bulk').send({ typeId: laptops, namePrefix: 'SAAC Laptop', first: 940, count: 5 });
    expect(res.status).toBe(409); // SAACLaptop942 already exists
    expect((await items('?q=SAAC')).length).toBe(1);
    const ok = await admin.post('/api/items/bulk').send({ typeId: laptops, namePrefix: 'SAAC Laptop', first: 1, count: 3 });
    expect(ok.body).toEqual({ created: 3, tags: ['SAACLaptop1', 'SAACLaptop2', 'SAACLaptop3'] });
    expect((await items('?q=SAAC Laptop')).map((i) => [i.assetTag, i.name]).sort()).toEqual([
      ['SAACLaptop1', 'SAACLaptop1'],
      ['SAACLaptop2', 'SAACLaptop2'],
      ['SAACLaptop3', 'SAACLaptop3'],
      ['SAACLaptop942', 'SAACLaptop942'],
    ]);
  });

  it('sets in repair or surplus with a note, and back in service', async () => {
    const id = (await byTag('SAACLaptop1')).id;
    expect((await admin.post(`/api/items/${id}/status`).send({ status: 'IN_REPAIR' })).status).toBe(400); // a note is required
    await admin.post(`/api/items/${id}/status`).send({ status: 'IN_REPAIR', note: 'Broken screen' });
    expect(await byTag('SAACLaptop1')).toMatchObject({ state: 'IN_REPAIR', statusNote: 'Broken screen' });
    await admin.post(`/api/items/${id}/status`).send({ status: 'IN_SERVICE' });
    expect(await byTag('SAACLaptop1')).toMatchObject({ state: 'AVAILABLE', statusNote: null });
  });

  it('will not change the status of, or retire, an item that is checked out', async () => {
    const term = await t.db.semester.create({ data: { code: 'FALL26', startsOn: new Date(), endsOn: new Date(Date.now() + 9e9), returnDeadline: new Date(Date.now() + 9e9), isCurrent: true } });
    const who = await t.db.borrower.create({ data: { pid: '9600001', firstName: 'Fake', lastName: 'Borrower' } });
    const id = (await byTag('SAACLaptop2')).id;
    await t.db.itemLoan.create({ data: { borrowerId: who.id, itemId: id, semesterId: term.id, dueDate: new Date(Date.now() + 9e9) } });
    const status = await admin.post(`/api/items/${id}/status`).send({ status: 'SURPLUS', note: 'Old' });
    expect(status.status).toBe(409);
    expect(status.body.message).toContain('Fake Borrower (9600001)');
    expect((await admin.post(`/api/items/${id}/retire`).send({})).status).toBe(409);
    expect((await byTag('SAACLaptop2')).state).toBe('OUT');
  });

  it('retires without deleting, keeps the history, and can restore', async () => {
    const id = (await byTag('SAACLaptop3')).id;
    await admin.post(`/api/items/${id}/retire`).send({ note: 'Lost' });
    expect((await byTag('SAACLaptop3')).state).toBe('RETIRED');
    expect(await t.db.item.count({ where: { id } })).toBe(1);
    await admin.post(`/api/items/${id}/restore`).send({});
    expect((await byTag('SAACLaptop3')).state).toBe('AVAILABLE');
    const h = (await desk.get(`/api/items/tech/${id}`)).body as ItemHistory;
    expect(h.events.map((e) => e.action)).toEqual(['Restored from retired', 'Retired', 'Added to inventory']);
    expect(h.events[1]?.note).toBe('Lost');
  });

  it('there is no delete, and staff cannot change inventory', async () => {
    const id = (await byTag('SAACLaptop942')).id;
    expect((await admin.agent.delete(`/api/items/${id}`).set('x-saac-request', '1')).status).toBe(404);
    expect((await desk.post('/api/items').send({ typeId: laptops, tag: 'X-1' })).status).toBe(403);
    expect((await desk.post(`/api/items/${id}/status`).send({ status: 'SURPLUS', note: 'x' })).status).toBe(403);
    expect((await desk.get('/api/items')).status).toBe(403);
    // Staff still find items through the search on Home.
    expect((await desk.get('/api/items/lookup?q=saaclaptop942')).body).toHaveLength(1);
  });

  it('lists types with their item counts, and filters by state', async () => {
    const types = (await admin.get('/api/item-types')).body as ItemTypeRow[];
    expect(types).toEqual([{ id: laptops, name: 'Laptops', itemCount: 4 }]);
    expect((await items('?state=OUT')).map((i) => i.assetTag)).toEqual(['SAACLaptop2']);
    expect((await admin.post('/api/item-types').send({ name: 'laptops' })).status).toBe(409);
  });
});

describe.skipIf(!hasDb)('inventory: book titles and copies', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof signIn>>;
  let calls = 0;
  let online = true;

  beforeAll(async () => {
    t = setupApp({
      fetcher: async (url) => {
        calls++;
        if (!online) throw new Error('network down');
        const isbn = url.match(/ISBN:(\d+)/)?.[1];
        const body = isbn === '9780306406157' ? { [`ISBN:${isbn}`]: { title: 'Fake Book', subtitle: 'A Test', authors: [{ name: 'Ann Author' }], publishers: [{ name: 'Fake Press' }], publish_date: 'March 2019' } } : {};
        return { ok: true, json: async () => body };
      },
    });
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    admin = await signIn(t.app, 'boss');
  });
  afterAll(() => t.db.$disconnect());

  it('looks a title up by ISBN, accepts ISBN-10, and caches the answer for offline use', async () => {
    const first = (await admin.get('/api/books/lookup/0306406152')).body;
    expect(first).toMatchObject({ isbn: '9780306406157', source: 'openlibrary', found: true, details: { title: 'Fake Book: A Test', author: 'Ann Author', publisher: 'Fake Press', publishedYear: '2019' } });
    online = false;
    const again = (await admin.get('/api/books/lookup/978-0-306-40615-7')).body;
    expect(again).toMatchObject({ source: 'cache', found: true, details: { title: 'Fake Book: A Test' } });
    expect(calls).toBe(1);
  });

  it('says offline when Open Library cannot be reached, so the admin types the details', async () => {
    const r = (await admin.get('/api/books/lookup/9780804429573')).body;
    expect(r).toMatchObject({ source: 'offline', found: false, details: null });
    expect((await admin.get('/api/books/lookup/12345')).status).toBe(400);
  });

  it('creates a title by hand with a normalized ISBN, and refuses a duplicate', async () => {
    const res = await admin.post('/api/books').send({ isbn: '0306406152', title: 'Fake Book', author: 'Ann Author', edition: '3' });
    expect(res.status).toBe(201);
    expect(res.body.isbn).toBe('9780306406157');
    expect((await admin.post('/api/books').send({ isbn: '9780306406157', title: 'Again' })).status).toBe(409);
    expect((await admin.post('/api/books').send({ isbn: '9780306406158', title: 'Typo' })).status).toBe(400);
    expect((await admin.get('/api/books/lookup/9780306406157')).body.existingBookId).toBe(res.body.id);
  });

  it('adds copies as separate records with their own numbered tags', async () => {
    const book = (await admin.get('/api/books?q=fake')).body as BookListResponse;
    const id = book.rows[0]!.id;
    const added = await admin.post(`/api/books/${id}/copies`).send({ count: 3, condition: 'New' });
    expect(added.body).toEqual({ created: 3, tags: ['C-00001', 'C-00002', 'C-00003'] });
    const more = await admin.post(`/api/books/${id}/copies`).send({ count: 1, copyTag: 'old-label 7' });
    expect(more.body.tags).toEqual(['old-label7']);
    const next = await admin.post(`/api/books/${id}/copies`).send({ count: 1 });
    expect(next.body.tags).toEqual(['C-00004']);
    const d = (await admin.get(`/api/books/${id}`)).body as BookDetail;
    expect(d.counts).toEqual({ total: 5, available: 5, assigned: 0, out: 0, retired: 0 });
    expect(d.copies.every((c) => c.state === 'AVAILABLE')).toBe(true);
  });

  it('shows each copy\'s state, and will not retire a copy that is out or reserved', async () => {
    const id = ((await admin.get('/api/books?q=9780306406157')).body as BookListResponse).rows[0]!.id;
    const copies = await t.db.bookCopy.findMany({ where: { bookId: id }, orderBy: { copyTag: 'asc' } });
    const term = await t.db.semester.create({ data: { code: 'FALL26', startsOn: new Date(), endsOn: new Date(Date.now() + 9e9), returnDeadline: new Date(Date.now() + 9e9), isCurrent: true } });
    const who = await t.db.borrower.create({ data: { pid: '9600002', firstName: 'Fake', lastName: 'Reader' } });
    await t.db.bookLoan.create({ data: { borrowerId: who.id, copyId: copies[0]!.id, semesterId: term.id, dueDate: new Date(Date.now() + 9e9) } });
    await t.db.bookNeed.create({ data: { borrowerId: who.id, semesterId: term.id, bookId: id, status: 'ASSIGNED', copyId: copies[1]!.id, source: 'MANUAL' } });

    expect((await admin.post(`/api/copies/${copies[0]!.id}/retire`).send({})).status).toBe(409);
    const reserved = await admin.post(`/api/copies/${copies[1]!.id}/retire`).send({});
    expect(reserved.status).toBe(409);
    expect(reserved.body.message).toContain('reserved for Fake Reader');
    expect((await admin.post(`/api/copies/${copies[2]!.id}/retire`).send({ note: 'Water damage' })).status).toBe(200);

    const d = (await admin.get(`/api/books/${id}`)).body as BookDetail;
    expect(d.counts).toEqual({ total: 5, available: 2, assigned: 1, out: 1, retired: 1 });
    expect(d.copies.find((c) => c.copyTag === 'C-00001')).toMatchObject({ state: 'OUT', holder: { pid: '9600002' } });
    expect(d.copies.find((c) => c.copyTag === 'C-00002')).toMatchObject({ state: 'ASSIGNED', assignedTo: { pid: '9600002' } });
    // The book list shows the same counts.
    expect(((await admin.get('/api/books?q=fake')).body as BookListResponse).rows[0]).toMatchObject({ total: 5, available: 2, assigned: 1, out: 1, retired: 1 });
  });

  it('records condition and notes on a copy, audited', async () => {
    const c = await t.db.bookCopy.findFirstOrThrow({ where: { copyTag: 'C-00004' } });
    const res = await admin.put(`/api/copies/${c.id}`).send({ condition: 'Fair', notes: 'Highlighting in chapter 2' });
    expect(res.body).toMatchObject({ condition: 'Fair', notes: 'Highlighting in chapter 2' });
    expect(await t.db.auditLog.count({ where: { action: 'copy.update', entityId: c.id } })).toBe(1);
  });
});
