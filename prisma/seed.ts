/**
 * FAKE DATA ONLY. Fills an empty development database so every dashboard widget has something to show.
 * Never run against the live host: it refuses when NODE_ENV=production.
 *
 *   npm run db:seed                       (empty database)
 *   npx prisma migrate reset --force      (wipe and reseed)
 */
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDb } from '../apps/api/src/db';
import { nyEndOfDay, parseDateOnly } from '../apps/api/src/lib/dates';
import { hashPassword } from '../apps/api/src/services/auth.service';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed fake data with NODE_ENV=production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const db = createDb(url);

// Deterministic pseudo-random numbers, so every seed gives the same fake data.
let state = 20261016;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
const chunk = <T>(xs: T[], n = 1000) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const FIRST = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Drew', 'Parker', 'Rowan', 'Skyler', 'Emerson', 'Dakota', 'Reese', 'Harper', 'Logan', 'Peyton', 'Sage', 'Kai', 'Robin', 'Ari', 'Sam', 'Cal', 'Bo', 'Dee', 'Eli', 'Zoe', 'Max', 'Ivy', 'Cy', 'Una', 'Vic', 'Gus', 'Hal', 'Nora', 'Otto', 'Lee', 'Pat'];
const LAST = ['Fakeman', 'Sampleton', 'Placeholder', 'Notreal', 'Synthia', 'Proxyman', 'Madeup', 'Examplez', 'Mockridge', 'Stubbins', 'Demoson', 'Pretendo', 'Bogus', 'Imaginary', 'Testwell', 'Dummyfield', 'Faux', 'Fixture', 'Mimic', 'Spoofer', 'Lorem', 'Ipsumson', 'Sandbox', 'Trialman', 'Draftley', 'Specimen', 'Prototyp', 'Templeton', 'Modelo', 'Simulacra'];
const SUBJECTS = ['ACG', 'BSC', 'CHM', 'COP', 'ECO', 'ENC', 'HIS', 'MAC', 'PHY', 'PSY', 'SPC', 'STA', 'SYG', 'AMH', 'MAN'];

function isbn13(seq: number): string {
  const body = `979${String(9000000000 + seq).slice(-9)}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + String((10 - (sum % 10)) % 10);
}

async function main() {
  if ((await db.borrower.count()) > 0) {
    console.error('The database already has people. Run `npx prisma migrate reset --force` to wipe and reseed.');
    process.exit(1);
  }
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(password);

  // ---- Users -----------------------------------------------------------------
  const admin = await db.user.create({ data: { username: 'admin', name: 'Maria Alvarez', passwordHash, role: 'ADMIN', mustChangePassword: false } });
  await db.user.create({ data: { username: 'desk', name: 'Jose Ruiz', passwordHash, role: 'STAFF', mustChangePassword: false } });

  // ---- Terms -----------------------------------------------------------------
  const termDefs = [
    { code: 'SPRING26', startsOn: '2026-01-12', endsOn: '2026-05-01', returnDeadline: '2026-05-06' },
    { code: 'SUMMER26', startsOn: '2026-05-11', endsOn: '2026-08-07', returnDeadline: '2026-08-12' },
    { code: 'FALL26', startsOn: '2026-08-24', endsOn: '2026-12-11', returnDeadline: '2026-12-16' },
  ];
  const terms: Record<string, { id: string; deadline: string }> = {};
  for (const t of termDefs) {
    const row = await db.semester.create({
      data: { code: t.code, startsOn: parseDateOnly(t.startsOn), endsOn: parseDateOnly(t.endsOn), returnDeadline: parseDateOnly(t.returnDeadline), isCurrent: t.code === 'FALL26' },
    });
    terms[t.code] = { id: row.id, deadline: t.returnDeadline };
  }

  // ---- People (3,161, the size of the real all-time file) ----------------------
  const teams = await db.team.findMany();
  // `inFall` marks the people tagged for FALL26. Only those on scholarship (athletes) or staff can borrow.
  const people: { id: string; kind: 'ATHLETE' | 'STAFF' | 'GRAD_ASSISTANT'; teamId: string | null; inFall: boolean; onScholarship: boolean; canBorrow: boolean }[] = [];
  const borrowerRows = [];
  for (let i = 0; i < 3161; i++) {
    const kind = i % 40 === 0 ? 'STAFF' : i % 67 === 0 ? 'GRAD_ASSISTANT' : 'ATHLETE';
    const teamId = kind === 'ATHLETE' ? pick(teams).id : null;
    const inFall = i < 1012;
    const onScholarship = kind === 'ATHLETE' && chance(0.6);
    const id = randomUUID();
    people.push({ id, kind, teamId, inFall, onScholarship, canBorrow: inFall && (kind !== 'ATHLETE' || onScholarship) });
    borrowerRows.push({
      id,
      pid: String(9000000 + i * 3).padStart(7, '0'),
      firstName: pick(FIRST),
      lastName: pick(LAST),
      kind,
      teamId,
      email: chance(0.6) ? `fake${i}@example.edu` : null,
      phone: chance(0.5) ? `305555${String(1000 + (i % 9000)).padStart(4, '0')}` : null,
      onScholarship,
    } as const);
  }
  for (const c of chunk(borrowerRows)) await db.borrower.createMany({ data: c });
  // Term tags: FALL26 for the current group, SPRING26 for the group before them, SUMMER26 for a few.
  const tags = people.flatMap((p, i) => [
    ...(p.inFall ? [{ borrowerId: p.id, semesterId: terms.FALL26!.id }] : []),
    ...(i < 986 ? [{ borrowerId: p.id, semesterId: terms.SPRING26!.id }] : []),
    ...(i < 312 ? [{ borrowerId: p.id, semesterId: terms.SUMMER26!.id }] : []),
  ]);
  for (const c of chunk(tags)) await db.borrowerTerm.createMany({ data: c });
  const active = people.filter((p) => p.canBorrow);

  // ---- Tech inventory ----------------------------------------------------------
  const types = Object.fromEntries(
    await Promise.all(['Laptops', 'Chargers', 'Other tech'].map(async (name) => [name, (await db.itemType.create({ data: { name } })).id] as const)),
  );
  const items: { id: string; typeName: string; status: 'IN_SERVICE' | 'IN_REPAIR' | 'SURPLUS'; retired: boolean }[] = [];
  const itemRows = [];
  const makeItems = (typeName: string, prefix: string, n: number, label: string) => {
    for (let i = 1; i <= n; i++) {
      const status = i % 23 === 0 ? 'IN_REPAIR' : i % 41 === 0 ? 'SURPLUS' : 'IN_SERVICE';
      const retired = i % 19 === 0 && status === 'IN_SERVICE';
      const id = randomUUID();
      items.push({ id, typeName, status, retired });
      itemRows.push({
        id,
        assetTag: `${prefix}-${String(i).padStart(4, '0')}`,
        name: `${label} ${i}`,
        typeId: types[typeName]!,
        status,
        statusNote: status === 'IN_REPAIR' ? 'Cracked screen' : status === 'SURPLUS' ? 'Too old to lend' : null,
        retiredAt: retired ? new Date('2026-03-01T15:00:00Z') : null,
      } as const);
    }
  };
  makeItems('Laptops', 'L', 84, 'Laptop');
  makeItems('Chargers', 'H', 55, 'Charger');
  makeItems('Other tech', 'T', 14, 'Calculator');
  await db.item.createMany({ data: itemRows });

  // ---- Books, classes, copies --------------------------------------------------
  const books = Array.from({ length: 240 }, (_, i) => ({
    id: randomUUID(),
    isbn: isbn13(i + 1),
    title: `Fake Textbook ${i + 1}: ${pick(['Foundations', 'Principles', 'An Introduction', 'Concepts', 'Methods'])}`,
    author: `${pick(FIRST)} ${pick(LAST)}`,
    edition: chance(0.7) ? `${1 + Math.floor(rand() * 9)}` : null,
  }));
  await db.book.createMany({ data: books });

  const fall = terms.FALL26!;
  const courses = Array.from({ length: 160 }, (_, i) => ({
    id: randomUUID(),
    semesterId: fall.id,
    subject: SUBJECTS[i % SUBJECTS.length]!,
    catalog: String(1000 + ((i * 37) % 3000)),
    section: `U0${1 + (i % 4)}`,
  }));
  await db.course.createMany({ data: courses, skipDuplicates: true });
  const courseBook = courses.map((c, i) => ({ courseId: c.id, bookId: books[i % books.length]!.id }));
  await db.courseBook.createMany({ data: courseBook });

  const enrollments: { borrowerId: string; courseId: string }[] = [];
  for (const p of active) {
    const n = 2 + Math.floor(rand() * 2);
    const chosen = new Set<string>();
    while (chosen.size < n) chosen.add(pick(courses).id);
    for (const courseId of chosen) enrollments.push({ borrowerId: p.id, courseId });
  }
  for (const c of chunk(enrollments)) await db.enrollment.createMany({ data: c });

  // Copies: a little less than demand for some titles, so a few come up short.
  const demand = new Map<string, number>();
  const bookOfCourse = new Map(courseBook.map((cb) => [cb.courseId, cb.bookId]));
  for (const e of enrollments) {
    const b = bookOfCourse.get(e.courseId)!;
    demand.set(b, (demand.get(b) ?? 0) + 1);
  }
  const copies: { id: string; bookId: string; copyTag: string; retiredAt: Date | null }[] = [];
  let tag = 1;
  for (const b of books) {
    const want = demand.get(b.id) ?? 2;
    const n = Math.max(1, Math.round(want * (b.isbn.endsWith('7') ? 0.7 : 1.08)));
    for (let i = 0; i < n; i++) {
      copies.push({ id: randomUUID(), bookId: b.id, copyTag: `C-${String(tag++).padStart(5, '0')}`, retiredAt: chance(0.01) ? new Date('2026-02-01T15:00:00Z') : null });
    }
  }
  for (const c of chunk(copies)) await db.bookCopy.createMany({ data: c });

  // ---- FALL26 needs and book loans ---------------------------------------------
  const freeCopies = new Map<string, string[]>();
  for (const c of copies) if (!c.retiredAt) freeCopies.set(c.bookId, [...(freeCopies.get(c.bookId) ?? []), c.id]);
  const fallDue = nyEndOfDay(fall.deadline);
  const needs = [];
  const bookLoans = [];
  const seen = new Set<string>();
  for (const e of enrollments) {
    const bookId = bookOfCourse.get(e.courseId)!;
    const key = `${e.borrowerId}|${bookId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const needId = randomUUID();
    const roll = rand();
    const pool = freeCopies.get(bookId) ?? [];
    if (roll < 0.03) {
      needs.push({ id: needId, borrowerId: e.borrowerId, semesterId: fall.id, bookId, courseId: e.courseId, status: 'WAIVED' as const, source: 'SCHEDULE' as const, note: 'Bought the book' });
    } else if (roll < 0.86 && pool.length > 0) {
      const copyId = pool.pop()!;
      needs.push({ id: needId, borrowerId: e.borrowerId, semesterId: fall.id, bookId, courseId: e.courseId, status: 'ISSUED' as const, copyId, source: 'SCHEDULE' as const });
      const late = chance(0.01);
      bookLoans.push({
        borrowerId: e.borrowerId,
        copyId,
        needId,
        semesterId: fall.id,
        checkedOutAt: new Date(`2026-08-${String(24 + Math.floor(rand() * 6)).padStart(2, '0')}T15:00:00Z`),
        dueDate: late ? nyEndOfDay('2026-10-09') : fallDue,
        notes: late ? 'Short loan, due date overridden' : null,
      });
    } else if (roll < 0.95 && pool.length > 0) {
      needs.push({ id: needId, borrowerId: e.borrowerId, semesterId: fall.id, bookId, courseId: e.courseId, status: 'ASSIGNED' as const, copyId: pool.pop()!, source: 'SCHEDULE' as const });
    } else {
      needs.push({ id: needId, borrowerId: e.borrowerId, semesterId: fall.id, bookId, courseId: e.courseId, status: 'NEEDED' as const, source: 'SCHEDULE' as const });
    }
  }
  for (const c of chunk(needs)) await db.bookNeed.createMany({ data: c });
  for (const c of chunk(bookLoans)) await db.bookLoan.createMany({ data: c });

  // ---- Tech loans: FALL26 open, SPRING26 mostly returned -------------------------
  const lendable = items.filter((i) => i.status === 'IN_SERVICE' && !i.retired);
  const laptops = lendable.filter((i) => i.typeName === 'Laptops');
  const chargers = lendable.filter((i) => i.typeName === 'Chargers');
  const other = lendable.filter((i) => i.typeName === 'Other tech');
  const athletes = active.filter((p) => p.kind === 'ATHLETE');
  const itemLoans = [];
  const lend = (pool: typeof lendable, n: number, pastDueEvery: number) => {
    for (let i = 0; i < n && i < pool.length; i++) {
      const p = athletes[(i * 7 + pool.length) % athletes.length]!;
      const pastDue = i % pastDueEvery === 0;
      itemLoans.push({
        borrowerId: p.id,
        itemId: pool[i]!.id,
        semesterId: fall.id,
        checkedOutAt: new Date('2026-08-26T14:00:00Z'),
        dueDate: pastDue ? nyEndOfDay('2026-10-02') : fallDue,
        conditionOut: 'Good',
      });
    }
  };
  lend(laptops, 62, 9);
  lend(chargers, 21, 11);
  lend(other, 4, 50);

  const spring = terms.SPRING26!;
  const springDue = nyEndOfDay(spring.deadline);
  const outIds = new Set(itemLoans.map((l) => l.itemId));
  const springPool = lendable.filter((i) => !outIds.has(i.id));
  springPool.slice(0, 40).forEach((item, i) => {
    const p = athletes[(i * 13) % athletes.length]!;
    const stillOut = i < 2;
    itemLoans.push({
      borrowerId: p.id,
      itemId: item.id,
      semesterId: spring.id,
      checkedOutAt: new Date('2026-01-14T15:00:00Z'),
      dueDate: springDue,
      conditionOut: 'Good',
      ...(stillOut ? {} : { closedAt: new Date('2026-05-04T16:00:00Z'), outcome: 'RETURNED' as const, conditionIn: 'Good' }),
    });
  });
  await db.itemLoan.createMany({ data: itemLoans });

  // People still holding SPRING26 tech: one on hold, one waiting for an admin.
  const springHolders = itemLoans.filter((l) => l.semesterId === spring.id && !('closedAt' in l)).map((l) => l.borrowerId);
  if (springHolders[0]) await db.escalation.create({ data: { borrowerId: springHolders[0], semesterId: spring.id, stage: 'ON_HOLD', note: 'Checked against the signed agreement' } });
  if (springHolders[1]) await db.escalation.create({ data: { borrowerId: springHolders[1], semesterId: spring.id, stage: 'HOLD_PENDING_REVIEW' } });

  // ---- Backups and reminders ---------------------------------------------------
  await db.backupRun.create({ data: { at: new Date(Date.now() - 2 * 3_600_000), ok: true, location: 'backups/', sizeBytes: 48_000_000n, message: 'Seeded example' } });
  const lateTech = itemLoans.filter((l) => l.semesterId === fall.id && l.dueDate < new Date()).slice(0, 3);
  for (const l of lateTech) {
    await db.emailLog.create({ data: { borrowerId: l.borrowerId, kind: 'REMINDER', status: 'SENT', subject: 'Fake reminder', body: 'Fake body', sentAt: new Date() } });
  }

  console.log(`Seeded fake data: ${borrowerRows.length} people (${active.length} can borrow in FALL26), ${itemRows.length} tech items, ${copies.length} copies, ${bookLoans.length} book loans, ${itemLoans.length} tech loans.`);
  console.log(`Sign in as "admin" (ADMIN) or "desk" (STAFF) with password: ${password}`);
  void admin;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
