import { Router } from 'express';
import { z } from 'zod';
import { termCodeSchema } from '@saac/shared';
import { notFound } from '../http/errors';
import type { Services } from '../services';

const querySchema = z.object({
  term: termCodeSchema.optional(),
  view: z.enum(['open', 'pastdue', 'holdlist', 'holds']).default('open'),
  teamId: z.uuid().optional(),
});

export function loanRoutes(s: Services) {
  const r = Router();

  async function resolve(query: unknown) {
    const q = querySchema.parse(query);
    const term = await s.terms.resolve(q.term);
    if (!term) throw notFound('No term has been set up yet');
    const filter = q.view === 'pastdue' ? ('pastdue' as const) : ('open' as const);
    return { term, filter, teamId: q.teamId, view: q.view };
  }

  r.get('/loans/books', async (req, res) => {
    const { term, filter, teamId, view } = await resolve(req.query);
    if (view === 'holds') {
      res.json({ term, holds: await s.loans.listHolds(term.id) });
      return;
    }
    res.json({ term, rows: await s.loans.listBooks({ semesterId: term.id, filter, teamId }) });
  });

  r.get('/loans/items', async (req, res) => {
    const { term, filter, teamId, view } = await resolve(req.query);
    if (view === 'holds') {
      res.json({ term, holds: await s.loans.listHolds(term.id) });
      return;
    }
    res.json({ term, rows: await s.loans.listItems({ semesterId: term.id, filter, teamId }) });
  });

  r.get('/loans/all', async (req, res) => {
    const { term, filter, teamId, view } = await resolve(req.query);
    if (view === 'holds') {
      res.json({ term, holds: await s.loans.listHolds(term.id) });
      return;
    }
    const [books, items] = await Promise.all([
      s.loans.listBooks({ semesterId: term.id, filter, teamId }),
      s.loans.listItems({ semesterId: term.id, filter, teamId }),
    ]);
    res.json({ term, rows: [...items, ...books].sort((a, b) => a.dueDate.localeCompare(b.dueDate)) });
  });

  return r;
}
