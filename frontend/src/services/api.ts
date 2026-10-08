export interface ApiError {
  error: string;
  message: string;
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

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const serverWakeTimeoutMs = 60_000;
const healthRequestTimeoutMs = 5_000;
const healthRetryDelayMs = 2_000;

function resolveApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const path = url.startsWith('/') ? url : `/${url}`;
  return `${apiBaseUrl}${path}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitUntilReady(): Promise<void> {
  const deadline = Date.now() + serverWakeTimeoutMs;

  while (Date.now() < deadline) {
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
    } catch {
      // A sleeping/restarting service can fail at the network or CORS layer.
      // Retry only the harmless health check, never the account mutation.
    } finally {
      window.clearTimeout(requestTimeout);
    }

    const delayTime = Math.min(healthRetryDelayMs, deadline - Date.now());
    if (delayTime > 0) {
      await delay(delayTime);
    }
  }

  throw new Error('The server is taking longer than expected to start. Please try again in a moment.');
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

  const response = await fetch(resolveApiUrl(url), {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return {} as T;
  }

  let body: any;
  try {
    body = await response.json();
  } catch (err) {
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
      } catch (err) {
        // Ignore resolution error
      }
    }
    const errorBody: ApiError = body || {
      error: 'UnknownError',
      message: 'An unexpected response was received from the server.'
    };
    throw new CustomApiError(response.status, errorBody);
  }

  return body as T;
}

export const api = {
  waitUntilReady,
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
