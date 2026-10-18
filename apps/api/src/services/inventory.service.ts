import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  bulkItems,
  itemBulkInputSchema,
  itemInputSchema,
  itemStatusInputSchema,
  itemTypeInputSchema,
  retireInputSchema,
  type InventoryItemRow,
  type ItemState,
  type ItemTypeRow,
} from '@saac/shared';
import type { Db, Tx } from '../db';
import type { Item } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../http/errors';
import { audit, auditMany } from './audit';

const personSelect = { id: true, pid: true, firstName: true, lastName: true, team: { select: { name: true } } } as const;

const snapshot = (i: Item) => ({
  assetTag: i.assetTag,
  name: i.name,
  typeId: i.typeId,
  status: i.status,
  statusNote: i.statusNote,
  notes: i.notes,
  retired: i.retiredAt !== null,
});

/** Lock the item row, then report whether it is out. Status changes and retiring wait for check-in. */
async function lockAndCheckOut(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Item" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound('No such item');
  const item = await tx.item.findUniqueOrThrow({ where: { id } });
  const open = await tx.itemLoan.findFirst({ where: { itemId: id, closedAt: null }, include: { borrower: { select: personSelect } } });
  return { item, open };
}

const outMessage = (open: { borrower: { firstName: string; lastName: string; pid: string } }) =>
  `It is checked out to ${open.borrower.firstName} ${open.borrower.lastName} (${open.borrower.pid}). Check it in first.`;

export const itemListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  typeId: z.uuid().optional(),
  state: z.enum(['AVAILABLE', 'OUT', 'IN_REPAIR', 'SURPLUS', 'RETIRED']).optional(),
});

/** Tech items and their types. Admin only. Items are retired, never deleted. */
export class InventoryService {
  constructor(private readonly db: Db) {}

  async types(): Promise<ItemTypeRow[]> {
    const rows = await this.db.itemType.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, itemCount: t._count.items }));
  }

  async createType(actorId: string, raw: unknown): Promise<ItemTypeRow> {
    const { name } = itemTypeInputSchema.parse(raw);
    if (await this.db.itemType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) throw conflict(`There is already a type called ${name}`);
    return this.db.$transaction(async (tx) => {
      const t = await tx.itemType.create({ data: { name } });
      await audit(tx, { userId: actorId, action: 'item_type.create', entityType: 'ItemType', entityId: t.id, after: { name } });
      return { id: t.id, name: t.name, itemCount: 0 };
    });
  }

  async list(query: z.infer<typeof itemListQuerySchema>, now = new Date()): Promise<InventoryItemRow[]> {
    const tokens = (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const items = await this.db.item.findMany({
      where: {
        ...(query.typeId ? { typeId: query.typeId } : {}),
        AND: tokens.map((t) => ({ OR: [{ assetTag: { contains: t, mode: 'insensitive' as const } }, { name: { contains: t, mode: 'insensitive' as const } }] })),
      },
      include: { type: true, loans: { where: { closedAt: null }, include: { borrower: { select: personSelect } }, take: 1 } },
      orderBy: [{ type: { name: 'asc' } }, { assetTag: 'asc' }],
    });
    const rows = items.map((i): InventoryItemRow => {
      const open = i.loans[0];
      const state: ItemState = i.retiredAt ? 'RETIRED' : open ? 'OUT' : i.status === 'IN_REPAIR' ? 'IN_REPAIR' : i.status === 'SURPLUS' ? 'SURPLUS' : 'AVAILABLE';
      return {
        id: i.id,
        assetTag: i.assetTag,
        name: i.name,
        typeId: i.typeId,
        typeName: i.type.name,
        state,
        statusNote: i.statusNote,
        notes: i.notes,
        holder: open
          ? { id: open.borrower.id, pid: open.borrower.pid, firstName: open.borrower.firstName, lastName: open.borrower.lastName, name: `${open.borrower.lastName}, ${open.borrower.firstName}`, team: open.borrower.team?.name ?? null }
          : null,
        dueDate: open?.dueDate.toISOString() ?? null,
        pastDue: open ? open.dueDate < now : false,
      };
    });
    return query.state ? rows.filter((r) => r.state === query.state) : rows;
  }

  /** Tags match ignoring case: SAACLaptop942 and saaclaptop942 are the same label. */
  private async tagTaken(assetTag: string, exceptId?: string) {
    const found = await this.db.item.findFirst({ where: { assetTag: { equals: assetTag, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    return Boolean(found);
  }

  private async checkType(typeId: string) {
    if (!(await this.db.itemType.findUnique({ where: { id: typeId } }))) throw badRequest('No such type');
  }

  async create(actorId: string, raw: unknown): Promise<Item> {
    const input = itemInputSchema.parse(raw);
    await this.checkType(input.typeId);
    if (await this.tagTaken(input.assetTag)) throw conflict(`Tag ${input.assetTag} is already on another item`);
    return this.db.$transaction(async (tx) => {
      const item = await tx.item.create({ data: { ...input, notes: input.notes ?? null } });
      await audit(tx, { userId: actorId, action: 'item.create', entityType: 'Item', entityId: item.id, after: snapshot(item) });
      return item;
    });
  }

  /** Add a numbered run of items in one go. All or none: one taken tag stops the whole run. */
  async createBulk(actorId: string, raw: unknown): Promise<{ created: number }> {
    const input = itemBulkInputSchema.parse(raw);
    await this.checkType(input.typeId);
    const planned = bulkItems(input);
    const taken = await this.db.item.findMany({ where: { OR: planned.map((p) => ({ assetTag: { equals: p.assetTag, mode: 'insensitive' as const } })) }, select: { assetTag: true } });
    if (taken.length > 0) {
      const list = taken.map((t) => t.assetTag).slice(0, 5).join(', ');
      throw conflict(`${taken.length === 1 ? 'Tag' : 'Tags'} ${list}${taken.length > 5 ? ' and more' : ''} already on other items. Pick another starting number or name.`);
    }
    return this.db.$transaction(async (tx) => {
      const ids = planned.map(() => randomUUID());
      await tx.item.createMany({ data: planned.map((p, i) => ({ id: ids[i], typeId: input.typeId, name: p.name, assetTag: p.assetTag })) });
      await auditMany(
        tx,
        planned.map((p, i) => ({ userId: actorId, action: 'item.create', entityType: 'Item', entityId: ids[i]!, after: { assetTag: p.assetTag, name: p.name, typeId: input.typeId } })),
      );
      return { created: planned.length };
    });
  }

  async update(actorId: string, id: string, raw: unknown): Promise<Item> {
    const input = itemInputSchema.parse(raw);
    await this.checkType(input.typeId);
    return this.db.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id } });
      if (!before) throw notFound('No such item');
      if (await this.tagTaken(input.assetTag, id)) {
        throw conflict(`Tag ${input.assetTag} is already on another item`);
      }
      const after = await tx.item.update({ where: { id }, data: { ...input, notes: input.notes ?? null } });
      await audit(tx, { userId: actorId, action: 'item.update', entityType: 'Item', entityId: id, before: snapshot(before), after: snapshot(after) });
      return after;
    });
  }

  /**
   * In service, in repair or surplus. Repair and surplus need a note and block checkout.
   * An item that is out cannot change status until it is checked in; the row lock means a
   * checkout at the same moment cannot slip past this check.
   */
  async setStatus(actorId: string, id: string, raw: unknown): Promise<Item> {
    const input = itemStatusInputSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      const { item: before, open } = await lockAndCheckOut(tx, id);
      if (before.retiredAt) throw badRequest('This item is retired. Restore it first.');
      if (open && input.status !== 'IN_SERVICE') throw conflict(outMessage(open));
      const after = await tx.item.update({ where: { id }, data: { status: input.status, statusNote: input.status === 'IN_SERVICE' ? null : (input.note ?? null) } });
      await audit(tx, { userId: actorId, action: 'item.status', entityType: 'Item', entityId: id, before: snapshot(before), after: snapshot(after) });
      return after;
    });
  }

  /** Take an item out of use for good, keeping its history. It must be checked in first. */
  async retire(actorId: string, id: string, raw: unknown): Promise<Item> {
    const { note } = retireInputSchema.parse(raw ?? {});
    return this.db.$transaction(async (tx) => {
      const { item: before, open } = await lockAndCheckOut(tx, id);
      if (before.retiredAt) throw badRequest('This item is already retired');
      if (open) throw conflict(outMessage(open));
      const after = await tx.item.update({ where: { id }, data: { retiredAt: new Date(), statusNote: note ?? before.statusNote } });
      await audit(tx, { userId: actorId, action: 'item.retire', entityType: 'Item', entityId: id, before: snapshot(before), after: { ...snapshot(after), note: note ?? null } });
      return after;
    });
  }

  async restore(actorId: string, id: string): Promise<Item> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id } });
      if (!before) throw notFound('No such item');
      if (!before.retiredAt) throw badRequest('This item is not retired');
      const after = await tx.item.update({ where: { id }, data: { retiredAt: null } });
      await audit(tx, { userId: actorId, action: 'item.restore', entityType: 'Item', entityId: id, before: snapshot(before), after: snapshot(after) });
      return after;
    });
  }
}
