import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDb, makeUser, PASSWORD, resetDb, setupApp, signIn, type TestApp } from './helpers';

describe.skipIf(!hasDb)('login, roles and audit', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = setupApp();
    await resetDb(t.db);
    await makeUser(t.db, 'boss', 'ADMIN');
    await makeUser(t.db, 'desk', 'STAFF');
    await makeUser(t.db, 'newbie', 'STAFF', { mustChangePassword: true });
  });
  afterAll(() => t.db.$disconnect());

  it('rejects requests without a session', async () => {
    for (const url of ['/api/dashboard', '/api/borrowers', '/api/users', '/api/borrowers/search?q=a']) {
      const res = await request(t.app).get(url);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String) });
    }
  });

  it('rejects a wrong password with one generic message', async () => {
    const a = await request(t.app).post('/api/auth/login').set('x-saac-request', '1').send({ username: 'desk', password: 'nope' });
    const b = await request(t.app).post('/api/auth/login').set('x-saac-request', '1').send({ username: 'ghost', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.body.message).toBe(a.body.message);
  });

  it('blocks changes that lack the anti-forgery header', async () => {
    const res = await request(t.app).post('/api/auth/login').send({ username: 'desk', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('sets an httpOnly, SameSite=Strict session cookie', async () => {
    const res = await request(t.app).post('/api/auth/login').set('x-saac-request', '1').send({ username: 'desk', password: PASSWORD });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('keeps staff out of admin routes on the server', async () => {
    const desk = await signIn(t.app, 'desk');
    expect((await desk.get('/api/users')).status).toBe(403);
    expect((await desk.get('/api/imports')).status).toBe(403);
    expect((await desk.get('/api/audit')).status).toBe(403);
    expect((await desk.post('/api/users').send({})).status).toBe(403);
    expect((await desk.post('/api/borrowers').send({})).status).toBe(403);
    expect((await desk.post('/api/imports/students/preview')).status).toBe(403);
    expect((await desk.get('/api/borrowers')).status).toBe(200);
  });

  it('makes a new account set its own password first', async () => {
    const newbie = await signIn(t.app, 'newbie');
    expect((await newbie.get('/api/dashboard')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await newbie.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-pass' });
    expect(changed.status).toBe(200);
    expect((await newbie.get('/api/dashboard')).status).toBe(200);
  });

  it('only an admin creates accounts, and the change is audited in the same transaction', async () => {
    const boss = await signIn(t.app, 'boss');
    const res = await boss.post('/api/users').send({ username: 'helper', name: 'Desk Helper', role: 'STAFF', temporaryPassword: 'temporary-123' });
    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    const entry = await t.db.auditLog.findFirst({ where: { action: 'user.create', entityId: res.body.id } });
    expect(entry?.after).toMatchObject({ username: 'helper', role: 'STAFF' });
    expect(JSON.stringify(entry?.after)).not.toContain('passwordHash');
  });

  it('keeps the audit log append-only in the database', async () => {
    const row = await t.db.auditLog.findFirstOrThrow();
    await expect(t.db.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow();
    await expect(t.db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it('signs out an idle session', async () => {
    const short = setupApp({ SESSION_IDLE_MINUTES: 1 });
    const desk = await signIn(short.app, 'desk');
    expect((await desk.get('/api/auth/me')).status).toBe(200);
    await short.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await desk.get('/api/auth/me')).status).toBe(401);
    await short.db.$disconnect();
  });

  it('background refreshes do not keep an idle session alive', async () => {
    const desk = await signIn(t.app, 'desk');
    const session = await t.db.session.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const old = new Date(Date.now() - 5 * 60_000);
    await t.db.session.update({ where: { id: session.id }, data: { lastSeenAt: old, expiresAt: new Date(Date.now() + 60_000) } });
    await desk.get('/api/dashboard').set('x-saac-background', '1');
    expect((await t.db.session.findUniqueOrThrow({ where: { id: session.id } })).lastSeenAt).toEqual(old);
    await desk.post('/api/auth/ping');
    expect((await t.db.session.findUniqueOrThrow({ where: { id: session.id } })).lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('signs out on request', async () => {
    const desk = await signIn(t.app, 'desk');
    expect((await desk.post('/api/auth/logout')).status).toBe(204);
    expect((await desk.get('/api/auth/me')).status).toBe(401);
  });
});
