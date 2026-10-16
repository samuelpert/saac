import type { z } from 'zod';
import type { createUserSchema, updateUserSchema, UserRow } from '@saac/shared';
import type { Db } from '../db';
import type { User } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../http/errors';
import { audit } from './audit';
import { hashPassword } from './auth.service';

// Audit snapshots never include the password hash.
const snapshot = (u: User) => ({ username: u.username, name: u.name, email: u.email, role: u.role, active: u.active });

const toRow = (u: User): UserRow => ({
  id: u.id,
  username: u.username,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt.toISOString(),
});

export class UsersService {
  constructor(private readonly db: Db) {}

  async list(): Promise<UserRow[]> {
    const users = await this.db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return users.map(toRow);
  }

  async create(actorId: string | null, input: z.infer<typeof createUserSchema>): Promise<UserRow> {
    const existing = await this.db.user.findUnique({ where: { username: input.username } });
    if (existing) throw conflict(`The username ${input.username} is taken`);
    const passwordHash = await hashPassword(input.temporaryPassword);
    return this.db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username,
          name: input.name,
          email: input.email || null,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await audit(tx, { userId: actorId ?? u.id, action: 'user.create', entityType: 'User', entityId: u.id, after: snapshot(u) });
      return toRow(u);
    });
  }

  async update(actorId: string, id: string, input: z.infer<typeof updateUserSchema>): Promise<UserRow> {
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw notFound('No such user');
      if (id === actorId && (input.active === false || input.role === 'STAFF')) {
        throw badRequest('You cannot deactivate or demote your own account');
      }
      if (before.role === 'ADMIN' && before.active && (input.active === false || input.role === 'STAFF')) {
        const admins = await tx.user.count({ where: { role: 'ADMIN', active: true } });
        if (admins <= 1) throw badRequest('Keep at least one active admin');
      }
      const after = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email === undefined ? undefined : input.email || null,
          role: input.role,
          active: input.active,
        },
      });
      if (input.active === false) await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { userId: actorId, action: 'user.update', entityType: 'User', entityId: id, before: snapshot(before), after: snapshot(after) });
      return toRow(after);
    });
  }

  async resetPassword(actorId: string, id: string, temporaryPassword: string): Promise<void> {
    const passwordHash = await hashPassword(temporaryPassword);
    await this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw notFound('No such user');
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { userId: actorId, action: 'user.password_reset', entityType: 'User', entityId: id });
    });
  }
}
