// localStorage: единая защита от приватного режима (бросает исключение на
// каждую операцию) и от мусора в сохранённом значении.

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // приватный режим — работаем без персиста
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // нет персиста — нечего и удалять
  }
}

/** Чтение JSON: повреждённое или чужое значение = fallback, а не исключение. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
