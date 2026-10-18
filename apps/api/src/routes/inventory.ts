import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { bookListQuerySchema } from '../services/books.service';
import { itemListQuerySchema } from '../services/inventory.service';

const idParam = z.object({ id: z.uuid() });

/** Mounted behind requireAdmin. Nothing here deletes: items and copies are retired. */
export function inventoryRoutes(s: Services) {
  const r = Router();

  r.get('/item-types', async (_req, res) => {
    res.json(await s.inventory.types());
  });
  r.post('/item-types', async (req, res) => {
    res.status(201).json(await s.inventory.createType(req.user!.id, req.body));
  });

  r.get('/items', async (req, res) => {
    res.json(await s.inventory.list(itemListQuerySchema.parse(req.query)));
  });
  r.post('/items', async (req, res) => {
    res.status(201).json(await s.inventory.create(req.user!.id, req.body));
  });
  r.post('/items/bulk', async (req, res) => {
    res.status(201).json(await s.inventory.createBulk(req.user!.id, req.body));
  });
  r.put('/items/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.inventory.update(req.user!.id, id, req.body));
  });
  r.post('/items/:id/status', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.inventory.setStatus(req.user!.id, id, req.body));
  });
  r.post('/items/:id/retire', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.inventory.retire(req.user!.id, id, req.body));
  });
  r.post('/items/:id/restore', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.inventory.restore(req.user!.id, id));
  });

  r.get('/books', async (req, res) => {
    res.json(await s.books.list(bookListQuerySchema.parse(req.query)));
  });
  r.get('/books/lookup/:isbn', async (req, res) => {
    const { isbn } = z.object({ isbn: z.string().max(40) }).parse(req.params);
    res.json(await s.books.lookupIsbn(isbn));
  });
  r.post('/books', async (req, res) => {
    res.status(201).json(await s.books.create(req.user!.id, req.body));
  });
  r.get('/books/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.books.detail(id));
  });
  r.put('/books/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.books.update(req.user!.id, id, req.body));
  });
  r.post('/books/:id/copies', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.status(201).json(await s.books.addCopies(req.user!.id, id, req.body));
  });
  r.put('/copies/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.books.updateCopy(req.user!.id, id, req.body));
  });
  r.post('/copies/:id/retire', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.books.retireCopy(req.user!.id, id, req.body));
  });
  r.post('/copies/:id/restore', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.books.restoreCopy(req.user!.id, id));
  });

  return r;
}
