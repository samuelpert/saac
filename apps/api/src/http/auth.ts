import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service';
import { SESSION_COOKIE } from '../services/auth.service';
import { AppError, forbidden, unauthorized } from './errors';

export function sessionMiddleware(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      // Automatic refreshes send x-saac-background so they do not count as someone using the screen.
      const found = await auth.resolve(token, req.get('x-saac-background') !== '1');
      if (found) {
        req.user = found.user;
        req.sessionId = found.sessionId;
      }
    }
    next();
  };
}

/** Every route behind this needs a signed-in user who has set their own password. */
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.mustChangePassword) {
    return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Set a new password before continuing'));
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') return next(forbidden('Only an admin can do this'));
  next();
};

/**
 * Changes must carry a custom header. Browsers never add it to cross-site form posts,
 * and the session cookie is SameSite=Strict on top of that.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.get('x-saac-request') !== '1') return next(forbidden('Request blocked'));
  next();
};
