import { Router } from 'express';
import { z } from 'zod';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '@saac/shared';
import type { Services } from '../services';

const idParam = z.object({ id: z.uuid() });

/** Mounted behind requireAdmin. */
export function userRoutes(s: Services) {
  const r = Router();
  r.get('/users', async (_req, res) => {
    res.json(await s.users.list());
  });
  r.post('/users', async (req, res) => {
    res.status(201).json(await s.users.create(req.user!.id, createUserSchema.parse(req.body)));
  });
  r.patch('/users/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await s.users.update(req.user!.id, id, updateUserSchema.parse(req.body)));
  });
  r.post('/users/:id/reset-password', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { temporaryPassword } = resetPasswordSchema.parse(req.body);
    await s.users.resetPassword(req.user!.id, id, temporaryPassword);
    res.status(204).end();
  });
  return r;
}
