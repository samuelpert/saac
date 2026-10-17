import { Router } from 'express';
import { z } from 'zod';
import { borrowerListQuerySchema, termCodeSchema } from '@saac/shared';
import { requireAdmin } from '../http/auth';
import { notFound } from '../http/errors';
import type { Services } from '../services';

const listQuery = borrowerListQuerySchema.extend({ holding: termCodeSchema.optional() });
const idParam = z.object({ id: z.uuid() });

export function borrowerRoutes(s: Services) {
  const r = Router();

  r.get('/borrowers/search', async (req, res) => {
    const { q, term } = z.object({ q: z.string().max(100).default(''), term: termCodeSchema.optional() }).parse(req.query);
    res.json(await s.borrowers.search(q, term));
  });

  r.get('/borrowers', async (req, res) => {
    const { holding, ...query } = listQuery.parse(req.query);
    let holdingTermId: string | undefined;
    if (holding) {
      const term = await s.terms.resolve(holding);
      if (!term) throw notFound('No such term');
      holdingTermId = term.id;
    }
    res.json(await s.borrowers.list({ ...query, holdingTermId }));
  });

  r.get('/borrowers/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.borrowers.detail(id));
  });

  r.post('/borrowers', requireAdmin, async (req, res) => {
    res.status(201).json(await s.borrowers.create(req.user!.id, req.body));
  });

  r.put('/borrowers/:id', requireAdmin, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.borrowers.update(req.user!.id, id, req.body));
  });

  r.get('/teams', async (_req, res) => {
    res.json(await s.borrowers.teams());
  });

  return r;
}
