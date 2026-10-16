import type { ApiErrorBody } from '@saac/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Called on any 401 so the app can return to the sign-in screen. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function handle<T>(res: Response, path: string): Promise<T> {
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {};
    if (type.includes('application/json')) body = (await res.json()) as ApiErrorBody;
    // A wrong password is a 401 too, but it does not mean a session ended.
    if (res.status === 401 && onUnauthorized && path !== '/api/auth/login' && path !== '/api/auth/me') onUnauthorized();
    throw new ApiError(res.status, body.code ?? 'HTTP_ERROR', body.message ?? `Request failed (${res.status})`, body.details);
  }
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}

/**
 * GETs are marked as background requests: they never keep an idle session alive.
 * Only real use (typing, clicking) does, through the activity ping.
 */
export function apiGet<T>(path: string): Promise<T> {
  return fetch(path, { credentials: 'same-origin', headers: { 'x-saac-background': '1' } }).then((r) => handle<T>(r, path));
}

export function apiSend<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'x-saac-request': '1', ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r, path));
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
