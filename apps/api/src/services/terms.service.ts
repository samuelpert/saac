import type { TermInput, TermRow } from '@saac/shared';
import type { Db, Tx } from '../db';
import type { Semester } from '../generated/prisma/client';
import { formatDateOnly, nyDate, parseDateOnly } from '../lib/dates';
import { conflict, notFound } from '../http/errors';
import { audit } from './audit';

export const toTermRow = (s: Semester): TermRow => ({
  id: s.id,
  code: s.code,
  startsOn: formatDateOnly(s.startsOn),
  endsOn: formatDateOnly(s.endsOn),
  returnDeadline: formatDateOnly(s.returnDeadline),
  isCurrent: s.isCurrent,
});

const snapshot = (s: Semester) => ({ ...toTermRow(s), id: undefined });

/** A term is past once its end date has gone by (America/New_York). Past terms are read-only. */
export const isPastTerm = (t: Pick<TermRow, 'endsOn'>, now = new Date()) => t.endsOn < nyDate(now);

export class TermsService {
  constructor(private readonly db: Db) {}

  async list(): Promise<TermRow[]> {
    const terms = await this.db.semester.findMany({ orderBy: { startsOn: 'desc' } });
    return terms.map(toTermRow);
  }

  /** The requested term by code, else the current term, else the most recent one. */
  async resolve(code?: string): Promise<TermRow | null> {
    if (code) {
      const t = await this.db.semester.findUnique({ where: { code: code.toUpperCase() } });
      if (!t) throw notFound(`No term ${code.toUpperCase()}`);
      return toTermRow(t);
    }
    const t =
      (await this.db.semester.findFirst({ where: { isCurrent: true } })) ??
      (await this.db.semester.findFirst({ orderBy: { startsOn: 'desc' } }));
    return t ? toTermRow(t) : null;
  }

  async create(actorId: string, input: TermInput): Promise<TermRow> {
    if (await this.db.semester.findUnique({ where: { code: input.code } })) throw conflict(`${input.code} already exists`);
    return this.db.$transaction(async (tx) => {
      const isFirst = (await tx.semester.count()) === 0;
      const t = await tx.semester.create({
        data: {
          code: input.code,
          startsOn: parseDateOnly(input.startsOn),
          endsOn: parseDateOnly(input.endsOn),
          returnDeadline: parseDateOnly(input.returnDeadline),
          isCurrent: isFirst,
        },
      });
      await audit(tx, { userId: actorId, action: 'term.create', entityType: 'Semester', entityId: t.id, after: snapshot(t) });
      return toTermRow(t);
    });
  }

  async update(actorId: string, id: string, input: TermInput): Promise<TermRow> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.semester.findUnique({ where: { id } });
      if (!before) throw notFound('No such term');
      const clash = await tx.semester.findFirst({ where: { code: input.code, NOT: { id } } });
      if (clash) throw conflict(`${input.code} already exists`);
      const after = await tx.semester.update({
        where: { id },
        data: {
          code: input.code,
          startsOn: parseDateOnly(input.startsOn),
          endsOn: parseDateOnly(input.endsOn),
          returnDeadline: parseDateOnly(input.returnDeadline),
        },
      });
      await audit(tx, { userId: actorId, action: 'term.update', entityType: 'Semester', entityId: id, before: snapshot(before), after: snapshot(after) });
      return toTermRow(after);
    });
  }

  async makeCurrent(actorId: string, id: string): Promise<TermRow> {
    return this.db.$transaction(async (tx: Tx) => {
      const target = await tx.semester.findUnique({ where: { id } });
      if (!target) throw notFound('No such term');
      const previous = await tx.semester.findFirst({ where: { isCurrent: true } });
      await tx.semester.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const after = await tx.semester.update({ where: { id }, data: { isCurrent: true } });
      await audit(tx, {
        userId: actorId,
        action: 'term.make_current',
        entityType: 'Semester',
        entityId: id,
        before: { current: previous?.code ?? null },
        after: { current: after.code },
      });
      return toTermRow(after);
    });
  }
}
