// Единая точка обращения Node-слоя (SSR, route-хендлеры) к Python-бэкенду
// аккаунтов. Бэкенд — опциональная зависимость: он может не быть запущен,
// поэтому у каждого вызова есть честный ответ «нет данных», а не исключение
// наружу. Таймаут короткий: SSR не должен ждать упавшего сервиса.

export const BACKEND_URL = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

// Имя cookie сессии совпадает с SESSION_COOKIE в backend/accounts.py.
export const SESSION_COOKIE = "pinly_session";

type BackendRequest = {
  timeoutMs?: number;
  signal?: AbortSignal;
  session?: string | null;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
};

function initOf({
  timeoutMs = 2000,
  signal,
  session,
  method,
  body,
}: BackendRequest): RequestInit {
  const headers: Record<string, string> = {};
  if (session) headers.cookie = `${SESSION_COOKIE}=${session}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  };
}

/** Ответ бэкенда или null: не ответил, ошибка HTTP или тело не JSON. */
export async function backendJson<T>(path: string, opts: BackendRequest = {}): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, initOf(opts));
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
