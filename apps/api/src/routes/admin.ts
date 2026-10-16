import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { shortName } from '../services/dashboard.service';

const auditQuery = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  userId: z.uuid().optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Mounted behind requireAdmin. Read-only: the audit log has no update or delete path. */
export function adminRoutes(s: Services) {
  const r = Router();

  r.get('/audit', async (req, res) => {
    const q = auditQuery.parse(req.query);
    const rows = await s.db.auditLog.findMany({
      where: {
        entityType: q.entityType,
        entityId: q.entityId,
        userId: q.userId,
        ...(q.before ? { at: { lt: new Date(q.before) } } : {}),
      },
      include: { user: { select: { name: true, username: true } } },
      orderBy: { at: 'desc' },
      take: q.limit,
    });
    res.json(
      rows.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        user: e.user ? `${shortName(e.user.name)} (${e.user.username})` : 'System',
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.before,
        after: e.after,
      })),
    );
  });

  r.get('/backups', async (_req, res) => {
    const runs = await s.db.backupRun.findMany({ orderBy: { at: 'desc' }, take: 100 });
    res.json(
      runs.map((b) => ({
        id: b.id,
        at: b.at.toISOString(),
        ok: b.ok,
        location: b.location,
        sizeBytes: b.sizeBytes === null ? null : Number(b.sizeBytes),
        message: b.message,
      })),
    );
  });

  return r;
}
