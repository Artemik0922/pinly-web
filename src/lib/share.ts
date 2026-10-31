"use client";

// Два способа расписаться ссылкой: нативный sheet ОС и буфер обмена.
// Доступность первого known только в момент клика (на сервере navigator нет,
// а проверка в разметке дала бы несовпадение гидрации), поэтому выбор
// остаётся обработчику, а здесь — только сами операции.

export function copyToClipboard(text: string): boolean {
  try {
    void navigator.clipboard?.writeText(text);
    return true;
  } catch {
    // fallback для браузеров без Clipboard API и для незащищённого контекста
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    return false;
  }
}

/** Открыть системный sheet; null — нативного шеринга нет, зовите deeplink. */
export function nativeShare(opts: { title: string; text?: string; url: string }): boolean {
  if (!navigator.share) return false;
  navigator.share(opts).catch(() => undefined); // пользователь закрыл окно — не ошибка
  return true;
}

/** Адрес текущей страницы — только из обработчика, не из рендера. */
export function currentPageUrl(): string {
  return window.location.href;
}
