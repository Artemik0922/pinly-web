"use client";

// Счётчик событий. Модель — реклама, а реклама платит за показы, поэтому без
// «сколько пришло и откуда» нельзя отличить плохой продукт от отсутствия
// трафика. Персональных данных тут нет: бэкенд пишет обезличенный суточный
// хеш посетителя, а из реферера — только хост.

type Fields = { board?: string; pin?: string; category?: string; source?: string };

// В dev StrictMode эффект монтируется дважды, и без этой защиты каждый
// просмотр считался бы дважды — а показы и есть единица измерения в
// рекламной модели. Ключ живёт до следующей полной загрузки страницы.
const sent = new Set<string>();

function send(name: string, fields: Fields = {}) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({ name });
  for (const [key, value] of Object.entries(fields)) {
    if (value) params.set(key, value.slice(0, 64));
  }
  const url = `/api/ev?${params.toString()}`;
  const key = `${name}|${url}`;
  if (sent.has(key)) return;
  sent.add(key);
  // При уходе со страницы fetch успевает не всегда, а sendBeacon — да;
  // второй вариант остаётся для браузеров без него.
  if (navigator.sendBeacon?.(url, "")) return;
  void fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
}

// Явный источник перехода: ссылку кидают в чат, и Referer там теряется чаще,
// чем не теряется. Разметка добровольная (?from=), но без неё канал не видно.
function fromParam(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("from") ?? undefined;
}

export const track = {
  visit: () => send("visit"),
  signupOpen: () => send("signup_open"),
  boardView: (board: string) => send("board_view", { board, source: fromParam() }),
  boardCreated: (board: string) => send("board_created", { board }),
  pinSave: (pin: string, category?: string) => send("pin_save", { pin, category }),
  shareCopy: (board: string) => send("share_copy", { board }),
};
