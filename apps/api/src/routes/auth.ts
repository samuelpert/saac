import { Router, type CookieOptions } from 'express';
import { changePasswordSchema, loginSchema } from '@saac/shared';
import { unauthorized } from '../http/errors';
import { SESSION_COOKIE } from '../services/auth.service';
import type { Services } from '../services';

export function authRoutes(s: Services, cookieSecure: boolean, idleMinutes: number) {
  const r = Router();
  const cookie: CookieOptions = { httpOnly: true, sameSite: 'strict', secure: cookieSecure, path: '/' };

  r.post('/auth/login', async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const { token, user } = await s.auth.login(username, password, req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, token, cookie);
    res.json({ user, idleMinutes });
  });

  r.post('/auth/logout', async (req, res) => {
    if (req.sessionId && req.user) await s.auth.logout(req.sessionId, req.user.id);
    res.clearCookie(SESSION_COOKIE, cookie);
    res.status(204).end();
  });

  r.get('/auth/me', (req, res) => {
    if (!req.user) throw unauthorized();
    res.json({ user: req.user, idleMinutes });
  });

  // Sent by the screen while someone is using it, to keep the session from timing out.
  r.post('/auth/ping', (req, res) => {
    if (!req.user) throw unauthorized();
    res.status(204).end();
  });

  r.post('/auth/change-password', async (req, res) => {
    if (!req.user || !req.sessionId) throw unauthorized();
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await s.auth.changePassword(req.user.id, req.sessionId, currentPassword, newPassword);
    res.json({ user });
  });

  return r;
}
