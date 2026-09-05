import type { ApiErrorBody } from './types';

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4001/api';

// Access token lives in memory only (never localStorage) — an XSS payload
// that can run JS can also just call the API directly, but keeping the
// token out of persistent storage at least limits it to the current tab's
// lifetime and away from anything that reads localStorage. Session
// persistence across reloads comes from the httpOnly refresh cookie
// instead (see AuthContext's bootstrap refresh).
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** AuthContext registers this to react when a refresh attempt fails (e.g. redirect to /login). */
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.status = status;
    this.body = body;
  }
}

function rawFetch(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // credentials: 'include' sends/receives the httpOnly refresh cookie —
  // required since the API is on a different origin/port in dev.
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh — concurrent 401s all await the same attempt
 * instead of each firing their own refresh request. */
function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await rawFetch('/auth/refresh', { method: 'POST' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return { statusCode: res.status, message: res.statusText || 'Request failed' };
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, options);

  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, options);
    } else {
      setAccessToken(null);
      onSessionExpired?.();
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<T>(path, { method: 'POST', body: formData });
  },
  // Multi-photo upload (documents/3d-model-enhancement.md §1) — all files
  // share the 'files' field name, matching the backend's FilesInterceptor.
  uploadMany: <T>(path: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return apiFetch<T>(path, { method: 'POST', body: formData });
  },
};
