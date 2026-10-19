import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';

export function itemRoutes(s: Services) {
  const r = Router();
  r.get('/items/lookup', async (req, res) => {
    const { q } = z.object({ q: z.string().max(100).default('') }).parse(req.query);
    res.json(await s.items.lookup(q));
  });
  // Read-only, for the scan field: any signed-in user may see a title, its copies and who has them.
  r.get('/items/isbn/:isbn', async (req, res) => {
    const { isbn } = z.object({ isbn: z.string().max(20) }).parse(req.params);
    res.json(await s.books.byIsbn(isbn));
  });
  r.get('/items/:kind/:id', async (req, res) => {
    const { kind, id } = z.object({ kind: z.enum(['tech', 'book']), id: z.uuid() }).parse(req.params);
    res.json(await s.items.history(kind, id));
  });
  return r;
}
