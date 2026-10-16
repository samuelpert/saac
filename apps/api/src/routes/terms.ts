import { Router } from 'express';
import { z } from 'zod';
import { termInputSchema } from '@saac/shared';
import { requireAdmin } from '../http/auth';
import type { Services } from '../services';

const idParam = z.object({ id: z.uuid() });

export function termRoutes(s: Services) {
  const r = Router();
  r.get('/terms', async (_req, res) => {
    res.json(await s.terms.list());
  });
  r.post('/terms', requireAdmin, async (req, res) => {
    res.status(201).json(await s.terms.create(req.user!.id, termInputSchema.parse(req.body)));
  });
  r.put('/terms/:id', requireAdmin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.terms.update(req.user!.id, id, termInputSchema.parse(req.body)));
  });
  r.post('/terms/:id/current', requireAdmin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.terms.makeCurrent(req.user!.id, id));
  });
  return r;
}
