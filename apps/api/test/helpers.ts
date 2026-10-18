import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/app';
import { createDb, type Db } from '../src/db';
import { createServices, type Services } from '../src/services';
import { hashPassword } from '../src/services/auth.service';
import type { Fetcher } from '../src/services/books.service';

export const testDatabaseUrl = inject('testDatabaseUrl');
export const hasDb = testDatabaseUrl !== null;

export const PASSWORD = 'test-password-123';

export function setupApp(overrides: { SESSION_IDLE_MINUTES?: number; BACKUP_STALE_HOURS?: number; fetcher?: Fetcher } = {}) {
  const db = createDb(testDatabaseUrl!);
  // Tests never reach the network: Open Library answers come from the fetcher a test passes, or fail as offline.
  const offline: Fetcher = async () => {
    throw new Error('offline in tests');
  };
  const services = createServices(
    db,
    { SESSION_IDLE_MINUTES: overrides.SESSION_IDLE_MINUTES ?? 15, BACKUP_STALE_HOURS: overrides.BACKUP_STALE_HOURS ?? 30, BACKUP_DIR: '.' },
    { fetcher: overrides.fetcher ?? offline },
  );
  const app = createApp(services, { cookieSecure: false, idleMinutes: overrides.SESSION_IDLE_MINUTES ?? 15 });
  return { db, services, app };
}

/** Empty every table. The audit log's append-only trigger is lifted only for this, only in tests. */
export async function resetDb(db: Db) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const keep = new Set(['Team', 'GroupMapping']); // reference data from a migration
  const list = tables.filter((t) => !keep.has(t.tablename)).map((t) => `"${t.tablename}"`).join(', ');
  await db.$transaction([
    db.$executeRawUnsafe('ALTER TABLE "AuditLog" DISABLE TRIGGER USER'),
    db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`),
    db.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER USER'),
  ]);
}

export async function makeUser(db: Db, username: string, role: 'ADMIN' | 'STAFF', opts: { mustChangePassword?: boolean } = {}) {
  return db.user.create({
    data: { username, name: `Test ${username}`, role, passwordHash: await hashPassword(PASSWORD), mustChangePassword: opts.mustChangePassword ?? false },
  });
}

/** A supertest agent that is signed in and sends the anti-CSRF header on every change. */
export async function signIn(app: ReturnType<typeof createApp>, username: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('x-saac-request', '1').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    get: (url: string) => agent.get(url),
    post: (url: string) => agent.post(url).set('x-saac-request', '1'),
    put: (url: string) => agent.put(url).set('x-saac-request', '1'),
    patch: (url: string) => agent.patch(url).set('x-saac-request', '1'),
    agent,
  };
}

export type TestApp = ReturnType<typeof setupApp>;
export type { Services };
