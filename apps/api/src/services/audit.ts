import type { Tx } from '../db';
import type { Prisma } from '../generated/prisma/client';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

const toJson = (v: Prisma.InputJsonValue | null | undefined) => (v === null || v === undefined ? undefined : v);

/**
 * Write audit rows inside the caller's transaction, so a change and its audit entry
 * commit together or not at all.
 */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

export async function auditMany(tx: Tx, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await tx.auditLog.createMany({
    data: entries.map((e) => ({
      userId: e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: toJson(e.before),
      after: toJson(e.after),
    })),
  });
}
