import { Router } from 'express';
import { z } from 'zod';
import { termCodeSchema } from '@saac/shared';
import type { Services } from '../services';

const querySchema = z.object({ term: termCodeSchema.optional() });

export function dashboardRoutes(s: Services) {
  const r = Router();
  // One call returns every widget. Admin-only widgets are left out for staff, not just hidden.
  r.get('/dashboard', async (req, res) => {
    const { term } = querySchema.parse(req.query);
    res.json(await s.dashboard.get(term, req.user!.role === 'ADMIN'));
  });
  return r;
}
