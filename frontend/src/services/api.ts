export interface ApiError {
  error: string;
  message: string;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
  title?: string;
  errors?: Record<string, string[]>;
}

export class CustomApiError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message || `API Error got response status ${status}`);
    this.name = 'CustomApiError';
    this.status = status;
    this.body = body;
  }
}

export class NetworkApiError extends Error {
  constructor() {
    super('The connection to the server was interrupted.');
    this.name = 'NetworkApiError';
  }
}

export class ServerWakeTimeoutError extends Error {
  constructor() {
    super('The server is taking longer than expected to start.');
    this.name = 'ServerWakeTimeoutError';
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const serverWakeTimeoutMs = 60_000;
const healthRequestTimeoutMs = 5_000;
const healthRetryDelayMs = 2_000;

interface WaitUntilReadyOptions {
  timeoutMs?: number;
}

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const path = url.startsWith('/') ? url : `/${url}`;
  return `${apiBaseUrl}${path}`;
}

function normalizeApiError(status: number, body: ApiErrorPayload | null): ApiError {
  if (body?.message) {
    return { error: body.error || 'ApiError', message: body.message };
  }

  const validationMessages = body?.errors
    ? Object.values(body.errors).flat().filter(Boolean)
    : [];
  if (validationMessages.length > 0) {
    return { error: body?.error || 'ValidationError', message: validationMessages.join(' ') };
  }

  return {
    error: body?.error || 'UnknownError',
    message: body?.title || `An unexpected response was received from the server (${status}).`,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitUntilReady(options: WaitUntilReadyOptions = {}): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + (options.timeoutMs ?? serverWakeTimeoutMs);
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const controller = new AbortController();
    const remainingTime = deadline - Date.now();
    const requestTimeout = window.setTimeout(
      () => controller.abort(),
      Math.min(healthRequestTimeoutMs, remainingTime)
    );

    try {
      // Keep this a simple request: no credentials or custom headers are sent
      // while Azure App Service is waking up.
      const response = await fetch(resolveApiUrl('/health'), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.ok) {
        return;
      }

      if (import.meta.env.MODE !== 'test' && (attempt === 1 || attempt % 10 === 0)) {
        console.warn('[auth] health check returned an unhealthy response; retrying', {
          attempt,
          elapsedMs: Date.now() - startedAt,
          status: response.status,
        });
      }
    } catch (error) {
      // A sleeping/restarting service can fail at the network or CORS layer.
      // Retry only the harmless health check, never the account mutation.
      if (import.meta.env.MODE !== 'test' && (attempt === 1 || attempt % 10 === 0)) {
        console.warn('[auth] health check failed; retrying', {
          attempt,
          elapsedMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.name : 'NetworkError',
        });
      }
    } finally {
      window.clearTimeout(requestTimeout);
    }

    const delayTime = Math.min(healthRetryDelayMs, deadline - Date.now());
    if (delayTime > 0) {
      await delay(delayTime);
    }
  }

  throw new ServerWakeTimeoutError();
}

function waitBeforeRetry(): Promise<void> {
  return delay(healthRetryDelayMs);
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(url), {
      ...options,
      headers,
    });
  } catch {
    throw new NetworkApiError();
  }

  if (response.status === 204) {
    return {} as T;
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    // Only clear an existing session for protected requests. A 401 from the
    // login endpoint has no token and should keep its validation message.
    if (response.status === 401 && token) {
      try {
        import('../stores/useStore').then(({ useStore }) => {
          useStore.getState().logout();
        });
      } catch {
        // Ignore resolution error
      }
    }
    const errorBody = normalizeApiError(response.status, body);
    throw new CustomApiError(response.status, errorBody);
  }

  return body as T;
}

export const api = {
  waitUntilReady,
  waitBeforeRetry,
  get<T>(url: string, token?: string): Promise<T> {
    return request<T>(url, { method: 'GET' }, token);
  },
  post<T>(url: string, body: any, token?: string): Promise<T> {
    return request<T>(url, { method: 'POST', body: JSON.stringify(body) }, token);
  },
  put<T>(url: string, body: any, token?: string): Promise<T> {
    return request<T>(url, { method: 'PUT', body: JSON.stringify(body) }, token);
  },
  delete<T>(url: string, token?: string): Promise<T> {
    return request<T>(url, { method: 'DELETE' }, token);
  },
};
