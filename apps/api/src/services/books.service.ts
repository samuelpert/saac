import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  bookInputSchema,
  checkIsbn,
  copiesInputSchema,
  copyUpdateSchema,
  retireInputSchema,
  type BookDetail,
  type BookListResponse,
  type CopyCounts,
  type CopyRow,
  type IsbnLookupResult,
  type ItemState,
} from '@saac/shared';
import type { Db, Tx } from '../db';
import type { Book, BookCopy, Prisma } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../http/errors';
import { audit, auditMany } from './audit';

/** Fetch is injected so tests never touch the network. */
export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export interface BooksOptions {
  /** Set false to never call Open Library (titles are then typed by hand). */
  openLibrary: boolean;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

const COPY_TAG_PREFIX = 'C-';
const COPY_TAG_DIGITS = 5;

const personSelect = { id: true, pid: true, firstName: true, lastName: true, team: { select: { name: true } } } as const;
type PersonRow = { id: string; pid: string; firstName: string; lastName: string; team: { name: string } | null };
const personRef = (b: PersonRow) => ({ id: b.id, pid: b.pid, firstName: b.firstName, lastName: b.lastName, name: `${b.lastName}, ${b.firstName}`, team: b.team?.name ?? null });

const bookSnapshot = (b: Book) => ({ isbn: b.isbn, title: b.title, author: b.author, edition: b.edition, publisher: b.publisher, publishedYear: b.publishedYear, notes: b.notes });
const copySnapshot = (c: BookCopy) => ({ copyTag: c.copyTag, bookId: c.bookId, condition: c.condition, notes: c.notes, retired: c.retiredAt !== null });

export const bookListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

function requireIsbn(raw: string) {
  const c = checkIsbn(raw);
  if (!c.ok) throw badRequest(c.reason);
  return c.isbn;
}

/** Copy states, derived the same way as the dashboard: open loan, then retired, then assigned. */
function copyState(c: { retiredAt: Date | null }, open: boolean, assigned: boolean): ItemState {
  if (open) return 'OUT';
  if (c.retiredAt) return 'RETIRED';
  if (assigned) return 'ASSIGNED';
  return 'AVAILABLE';
}

/** Book titles and their physical copies. Admin only. Copies are retired, never deleted. */
export class BooksService {
  constructor(
    private readonly db: Db,
    private readonly opts: BooksOptions,
  ) {}

  private async counts(bookIds: string[]): Promise<Map<string, CopyCounts>> {
    if (bookIds.length === 0) return new Map();
    const rows = await this.db.$queryRaw<{ book_id: string; total: number; available: number; assigned: number; out: number; retired: number }[]>`
      SELECT c."bookId" AS book_id,
        count(*)::int AS total,
        count(*) FILTER (WHERE c."retiredAt" IS NULL AND ol.id IS NULL AND an.id IS NULL)::int AS available,
        count(*) FILTER (WHERE c."retiredAt" IS NULL AND ol.id IS NULL AND an.id IS NOT NULL)::int AS assigned,
        count(*) FILTER (WHERE ol.id IS NOT NULL)::int AS out,
        count(*) FILTER (WHERE c."retiredAt" IS NOT NULL AND ol.id IS NULL)::int AS retired
      FROM "BookCopy" c
      LEFT JOIN "BookLoan" ol ON ol."copyId" = c.id AND ol."closedAt" IS NULL
      LEFT JOIN "BookNeed" an ON an."copyId" = c.id AND an.status = 'ASSIGNED'
      WHERE c."bookId" = ANY(${bookIds})
      GROUP BY c."bookId"`;
    return new Map(rows.map((r) => [r.book_id, { total: r.total, available: r.available, assigned: r.assigned, out: r.out, retired: r.retired }]));
  }

  async list(query: z.infer<typeof bookListQuerySchema>): Promise<BookListResponse> {
    const tokens = (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.BookWhereInput = {
      AND: tokens.map((t) => {
        const digits = t.replace(/-/g, '');
        return {
          OR: [
            { title: { contains: t, mode: 'insensitive' as const } },
            { author: { contains: t, mode: 'insensitive' as const } },
            ...(/^\d+X?$/i.test(digits) ? [{ isbn: { contains: digits.toUpperCase() } }] : []),
          ],
        };
      }),
    };
    const [total, books] = await Promise.all([
      this.db.book.count({ where }),
      this.db.book.findMany({ where, orderBy: { title: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    const counts = await this.counts(books.map((b) => b.id));
    const none: CopyCounts = { total: 0, available: 0, assigned: 0, out: 0, retired: 0 };
    return {
      rows: books.map((b) => ({ id: b.id, isbn: b.isbn, title: b.title, author: b.author, edition: b.edition, ...(counts.get(b.id) ?? none) })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** A title found by the ISBN barcode on its cover. Books carry no labels of their own. */
  async byIsbn(raw: string): Promise<BookDetail> {
    const book = await this.db.book.findUnique({ where: { isbn: requireIsbn(raw) }, select: { id: true } });
    if (!book) throw notFound('Barcode not recognized. Please try again.');
    return this.detail(book.id);
  }

  async detail(id: string, now = new Date()): Promise<BookDetail> {
    const b = await this.db.book.findUnique({
      where: { id },
      include: {
        copies: {
          include: {
            loans: { where: { closedAt: null }, include: { borrower: { select: personSelect } }, take: 1 },
            needs: { where: { status: 'ASSIGNED' }, include: { borrower: { select: personSelect } }, take: 1 },
          },
          orderBy: { copyTag: 'asc' },
        },
      },
    });
    if (!b) throw notFound('No such title');
    const copies: CopyRow[] = b.copies.map((c) => {
      const open = c.loans[0];
      const need = c.needs[0];
      return {
        id: c.id,
        copyTag: c.copyTag,
        state: copyState(c, Boolean(open), Boolean(need)),
        condition: c.condition,
        notes: c.notes,
        acquiredAt: c.acquiredAt.toISOString(),
        holder: open ? personRef(open.borrower) : null,
        dueDate: open?.dueDate.toISOString() ?? null,
        pastDue: open ? open.dueDate < now : false,
        assignedTo: need && !open ? personRef(need.borrower) : null,
      };
    });
    const counts = (await this.counts([b.id])).get(b.id) ?? { total: 0, available: 0, assigned: 0, out: 0, retired: 0 };
    return { ...bookSnapshot(b), id: b.id, counts, copies };
  }

  async create(actorId: string, raw: unknown): Promise<Book> {
    const input = bookInputSchema.parse(raw);
    const isbn = requireIsbn(input.isbn);
    const existing = await this.db.book.findUnique({ where: { isbn } });
    if (existing) throw conflict(`ISBN ${isbn} is already in the catalog as "${existing.title}"`);
    return this.db.$transaction(async (tx) => {
      const b = await tx.book.create({ data: { ...input, isbn, author: input.author ?? null, edition: input.edition ?? null, publisher: input.publisher ?? null, publishedYear: input.publishedYear ?? null, notes: input.notes ?? null } });
      await audit(tx, { userId: actorId, action: 'book.create', entityType: 'Book', entityId: b.id, after: bookSnapshot(b) });
      return b;
    });
  }

  async update(actorId: string, id: string, raw: unknown): Promise<Book> {
    const input = bookInputSchema.parse(raw);
    const isbn = requireIsbn(input.isbn);
    return this.db.$transaction(async (tx) => {
      const before = await tx.book.findUnique({ where: { id } });
      if (!before) throw notFound('No such title');
      if (isbn !== before.isbn && (await tx.book.findUnique({ where: { isbn } }))) throw conflict(`ISBN ${isbn} is already on another title`);
      const after = await tx.book.update({
        where: { id },
        data: { ...input, isbn, author: input.author ?? null, edition: input.edition ?? null, publisher: input.publisher ?? null, publishedYear: input.publishedYear ?? null, notes: input.notes ?? null },
      });
      await audit(tx, { userId: actorId, action: 'book.update', entityType: 'Book', entityId: id, before: bookSnapshot(before), after: bookSnapshot(after) });
      return after;
    });
  }

  /** The next free number after the highest C-##### tag. Called under a lock so two admins never get the same tags. */
  private async nextCopyNumber(tx: Tx): Promise<number> {
    const [row] = await tx.$queryRaw<{ n: number | null }[]>`
      SELECT max(substring("copyTag" FROM ${`^${COPY_TAG_PREFIX}([0-9]+)$`})::int) AS n FROM "BookCopy"`;
    return (row?.n ?? 0) + 1;
  }

  /** Add copies of a title. Each copy is its own record with its own tag. */
  async addCopies(actorId: string, bookId: string, raw: unknown): Promise<{ created: number; tags: string[] }> {
    const input = copiesInputSchema.parse(raw);
    if (input.copyTag && input.count !== 1) throw badRequest('A tag you type yourself is for a single copy');
    return this.db.$transaction(async (tx) => {
      if (!(await tx.book.findUnique({ where: { id: bookId } }))) throw notFound('No such title');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('saac:copy-tags'))`;
      let tags: string[];
      if (input.copyTag) {
        if (await tx.bookCopy.findFirst({ where: { copyTag: { equals: input.copyTag, mode: 'insensitive' } } })) throw conflict(`Tag ${input.copyTag} is already on another copy`);
        tags = [input.copyTag];
      } else {
        const first = await this.nextCopyNumber(tx);
        tags = Array.from({ length: input.count }, (_, i) => `${COPY_TAG_PREFIX}${String(first + i).padStart(COPY_TAG_DIGITS, '0')}`);
      }
      const rows = tags.map((copyTag) => ({ id: randomUUID(), copyTag, bookId, condition: input.condition ?? null }));
      await tx.bookCopy.createMany({ data: rows });
      await auditMany(
        tx,
        rows.map((r) => ({ userId: actorId, action: 'copy.create', entityType: 'BookCopy', entityId: r.id, after: { copyTag: r.copyTag, bookId, condition: r.condition } })),
      );
      return { created: rows.length, tags };
    });
  }

  async updateCopy(actorId: string, id: string, raw: unknown): Promise<BookCopy> {
    const input = copyUpdateSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const before = await tx.bookCopy.findUnique({ where: { id } });
      if (!before) throw notFound('No such copy');
      const after = await tx.bookCopy.update({ where: { id }, data: { condition: input.condition === undefined ? before.condition : input.condition, notes: input.notes === undefined ? before.notes : input.notes } });
      await audit(tx, { userId: actorId, action: 'copy.update', entityType: 'BookCopy', entityId: id, before: copySnapshot(before), after: copySnapshot(after) });
      return after;
    });
  }

  /** Retire a lost or worn-out copy. It must be checked in and not reserved for a student. */
  async retireCopy(actorId: string, id: string, raw: unknown): Promise<BookCopy> {
    const { note } = retireInputSchema.parse(raw ?? {});
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "BookCopy" WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) throw notFound('No such copy');
      const before = await tx.bookCopy.findUniqueOrThrow({ where: { id } });
      if (before.retiredAt) throw badRequest('This copy is already retired');
      const open = await tx.bookLoan.findFirst({ where: { copyId: id, closedAt: null }, include: { borrower: { select: personSelect } } });
      if (open) throw conflict(`It is checked out to ${open.borrower.firstName} ${open.borrower.lastName} (${open.borrower.pid}). Check it in first.`);
      const need = await tx.bookNeed.findFirst({ where: { copyId: id, status: 'ASSIGNED' }, include: { borrower: { select: personSelect } } });
      if (need) throw conflict(`It is reserved for ${need.borrower.firstName} ${need.borrower.lastName} (${need.borrower.pid}). Release it first.`);
      const after = await tx.bookCopy.update({ where: { id }, data: { retiredAt: new Date(), notes: note ?? before.notes } });
      await audit(tx, { userId: actorId, action: 'copy.retire', entityType: 'BookCopy', entityId: id, before: copySnapshot(before), after: { ...copySnapshot(after), note: note ?? null } });
      return after;
    });
  }

  async restoreCopy(actorId: string, id: string): Promise<BookCopy> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.bookCopy.findUnique({ where: { id } });
      if (!before) throw notFound('No such copy');
      if (!before.retiredAt) throw badRequest('This copy is not retired');
      const after = await tx.bookCopy.update({ where: { id }, data: { retiredAt: null } });
      await audit(tx, { userId: actorId, action: 'copy.restore', entityType: 'BookCopy', entityId: id, before: copySnapshot(before), after: copySnapshot(after) });
      return after;
    });
  }

  /**
   * Look a title up by ISBN: the catalog first, then the local cache, then Open Library.
   * If Open Library cannot be reached the answer says "offline" and the admin types the details.
   * Only found answers are cached, so a title missing today can be found later.
   */
  async lookupIsbn(raw: string): Promise<IsbnLookupResult> {
    const isbn = requireIsbn(raw);
    const existing = await this.db.book.findUnique({ where: { isbn } });
    const base = { isbn, existingBookId: existing?.id ?? null };
    if (existing) {
      return { ...base, source: 'cache', found: true, details: { title: existing.title, author: existing.author, publisher: existing.publisher, publishedYear: existing.publishedYear } };
    }
    const cached = await this.db.isbnLookup.findUnique({ where: { isbn } });
    if (cached?.found) return { ...base, source: 'cache', found: true, details: cached.data as IsbnLookupResult['details'] };
    if (!this.opts.openLibrary) return { ...base, source: 'disabled', found: false, details: null };

    const fetcher = this.opts.fetcher ?? ((url, init) => fetch(url, init));
    let payload: unknown;
    try {
      const res = await fetcher(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000) });
      if (!res.ok) return { ...base, source: 'offline', found: false, details: null };
      payload = await res.json();
    } catch {
      return { ...base, source: 'offline', found: false, details: null };
    }
    const entry = (payload as Record<string, { title?: string; subtitle?: string; authors?: { name?: string }[]; publishers?: { name?: string }[]; publish_date?: string }>)[`ISBN:${isbn}`];
    if (!entry?.title) return { ...base, source: 'openlibrary', found: false, details: null };
    const details = {
      title: entry.subtitle ? `${entry.title}: ${entry.subtitle}` : entry.title,
      author: entry.authors?.map((a) => a.name).filter(Boolean).join(', ') || null,
      publisher: entry.publishers?.map((p) => p.name).filter(Boolean).join(', ') || null,
      publishedYear: entry.publish_date?.match(/\d{4}/)?.[0] ?? null,
    };
    await this.db.isbnLookup.upsert({ where: { isbn }, update: { found: true, data: details, fetchedAt: new Date() }, create: { isbn, found: true, data: details } });
    return { ...base, source: 'openlibrary', found: true, details };
  }
}
