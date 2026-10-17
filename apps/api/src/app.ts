import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import { csrfGuard, requireAdmin, requireUser, sessionMiddleware } from './http/auth';
import { errorHandler, notFoundHandler } from './http/errors';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { borrowerRoutes } from './routes/borrowers';
import { dashboardRoutes } from './routes/dashboard';
import { importRoutes } from './routes/imports';
import { itemRoutes } from './routes/items';
import { loanRoutes } from './routes/loans';
import { termRoutes } from './routes/terms';
import { userRoutes } from './routes/users';
import type { Services } from './services';

export interface AppOptions {
  cookieSecure: boolean;
  idleMinutes: number;
  /** Built web app to serve next to the API. Omit in development, where Vite serves it. */
  webDist?: string;
}

export function createApp(s: Services, opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  const api = Router();
  api.use(express.json({ limit: '2mb' }));
  api.use(cookieParser());
  api.use(csrfGuard);
  api.use(sessionMiddleware(s.auth));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.use(authRoutes(s, opts.cookieSecure, opts.idleMinutes));

  const signedIn = Router();
  signedIn.use(requireUser);
  signedIn.use(dashboardRoutes(s));
  signedIn.use(borrowerRoutes(s));
  signedIn.use(loanRoutes(s));
  signedIn.use(itemRoutes(s));
  signedIn.use(termRoutes(s));

  const admin = Router();
  admin.use(requireAdmin);
  admin.use(userRoutes(s));
  admin.use(importRoutes(s));
  admin.use(adminRoutes(s));
  signedIn.use(admin);

  api.use(signedIn);
  api.use(notFoundHandler);
  app.use('/api', api);

  if (opts.webDist && existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(opts.webDist!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
