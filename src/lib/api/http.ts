// Транспорт одного слоя: REST-клиент к Python-бэкенду (backend/*) через
// same-origin rewrites из next.config.ts. Сессия — httpOnly cookie от сервера,
// здесь только fetch. Всё, что повторялось в каждом эндпоинте (Content-Type,
// разбор 204, ошибка со статусом, сигнал 401), собрано тут.

/** Ошибка HTTP-ответа бэкенда. Статус нужен вызывающему: 404 = «нет», а не сбой. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

const unauthorizedListeners = new Set<() => void>();

/** Подписка на «сессия протухла». Возвращает функцию отписки. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

// 401 = cookie недействителен: сайт должен перейти в анонимный режим.
// Проба сессии сама разбирается с 401, её не трогаем — иначе вход в сайт
// сразу сбрасывал бы состояние.
function reportUnauthorized(res: Response, endpoint: string): void {
  if (res.status === 401 && !endpoint.endsWith("/api/auth/me")) {
    for (const listener of unauthorizedListeners) listener();
  }
}

async function toApiError(res: Response, endpoint: string): Promise<never> {
  reportUnauthorized(res, endpoint);
  throw new ApiError(`api ${res.status}`, res.status);
}

export async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  if (!res.ok) await toApiError(res, input);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// multipart: Content-Type не ставим — браузер сам добавляет boundary.
// Тело ответа факультативно: загрузка аватара отвечает 204 без JSON.
export async function requestMultipart<T>(input: string, body: FormData): Promise<T> {
  const res = await fetch(input, { method: "POST", body });
  if (!res.ok) await toApiError(res, input);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : undefined) as T;
}

/** GET-параметры: undefined и пустые значения в строку не попадают. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
