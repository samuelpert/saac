import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { SessionUser } from '@saac/shared';
import type { Db } from '../db';
import { AppError, badRequest } from '../http/errors';
import { audit } from './audit';

export const SESSION_COOKIE = 'saac_sid';
const TOUCH_EVERY_MS = 30_000;

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Verified against when the username does not exist, so a wrong username takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

const toSessionUser = (u: { id: string; username: string; name: string; role: 'ADMIN' | 'STAFF'; mustChangePassword: boolean }): SessionUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
});

/** Small in-memory brake on password guessing: 10 failures per username or address per 15 minutes. */
class LoginLimiter {
  private failures = new Map<string, number[]>();
  constructor(
    private readonly max = 10,
    private readonly windowMs = 15 * 60_000,
  ) {}
  private recent(key: string, now: number) {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.failures.set(key, list);
    return list;
  }
  blocked(keys: string[], now = Date.now()) {
    return keys.some((k) => this.recent(k, now).length >= this.max);
  }
  fail(keys: string[], now = Date.now()) {
    for (const k of keys) this.recent(k, now).push(now);
  }
  clear(keys: string[]) {
    for (const k of keys) this.failures.delete(k);
  }
}

export class AuthService {
  private limiter = new LoginLimiter();

  constructor(
    private readonly db: Db,
    private readonly idleMinutes: number,
  ) {}

  private expiry(from = new Date()) {
    return new Date(from.getTime() + this.idleMinutes * 60_000);
  }

  async login(username: string, password: string, address: string): Promise<{ token: string; user: SessionUser }> {
    const keys = [`u:${username}`, `a:${address}`];
    if (this.limiter.blocked(keys)) {
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Wait 15 minutes or ask an admin to reset your password.');
    }
    const user = await this.db.user.findUnique({ where: { username } });
    const ok = user
      ? await argon2.verify(user.passwordHash, password)
      : (await argon2.verify(await getDummyHash(), password), false);
    if (!user || !ok || !user.active) {
      this.limiter.fail(keys);
      throw new AppError(401, 'BAD_LOGIN', 'Wrong username or password');
    }
    this.limiter.clear(keys);

    const token = randomBytes(32).toString('base64url');
    await this.db.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: { tokenHash: sha256(token), userId: user.id, expiresAt: this.expiry() },
      });
      await audit(tx, { userId: user.id, action: 'user.login', entityType: 'Session', entityId: session.id });
    });
    return { token, user: toSessionUser(user) };
  }

  /**
   * Find the signed-in user for a cookie token. With `touch`, slide the idle timeout forward;
   * background refreshes pass false so an unattended screen still signs out.
   */
  async resolve(token: string, touch = true): Promise<{ sessionId: string; user: SessionUser } | null> {
    const now = new Date();
    const session = await this.db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt <= now || !session.user.active) {
      await this.db.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (touch && now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.db.session.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt: this.expiry(now) } });
    }
    return { sessionId: session.id, user: toSessionUser(session.user) };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { id: sessionId } });
      await audit(tx, { userId, action: 'user.logout', entityType: 'Session', entityId: sessionId });
    });
  }

  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string): Promise<SessionUser> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, currentPassword))) throw badRequest('Your current password is wrong');
    if (currentPassword === newPassword) throw badRequest('Pick a password different from the current one');
    const passwordHash = await hashPassword(newPassword);
    const updated = await this.db.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
      // Sign out every other browser that used the old password.
      await tx.session.deleteMany({ where: { userId, NOT: { id: sessionId } } });
      await audit(tx, { userId, action: 'user.password_changed', entityType: 'User', entityId: userId });
      return u;
    });
    return toSessionUser(updated);
  }

  /** Remove sessions that ran out. Called on a timer; expired sessions are also rejected on use. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return count;
  }
}
