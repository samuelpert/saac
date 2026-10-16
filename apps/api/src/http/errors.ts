import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@saac/shared';
import { Prisma } from '../generated/prisma/client';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const forbidden = (message = 'You do not have access to this') => new AppError(403, 'FORBIDDEN', message);
export const unauthorized = (message = 'Please sign in') => new AppError(401, 'UNAUTHORIZED', message);

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = { code: 'NOT_FOUND', message: 'No such API route' };
  res.status(404).json(body);
};

/**
 * Turns any thrown error into `{ code, message }`. Messages never echo request data,
 * so student values cannot leak into logs or responses through an error.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { code: 'INTERNAL', message: 'Something went wrong. Try again, and tell an admin if it keeps happening.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION',
      message: err.issues[0]?.message ?? 'Some values are not valid',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { code: 'CONFLICT', message: 'That record already exists' };
  } else if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    status = 413;
    body = { code: 'TOO_LARGE', message: 'The upload is too large' };
  }

  if (status >= 500) {
    // Log the error kind and stack only. Never log request bodies: they can hold student data.
    console.error('[api] unhandled error:', err instanceof Error ? err.stack : String(err));
  }
  res.status(status).json(body);
};
