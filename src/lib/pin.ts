// Модель пина: контракт, который разделяют моки, внешние источники
// (Openverse, музеи, Wikimedia), загрузки пользователей и клиентские карточки.
// Модуль клиент-безопасен: никаких node-импортов — из него собирают URL
// карточки в браузере.

export type Pin = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  width: number;
  height: number;
  seed: string;
  likes: number;
  // Поля динамических пинов (Openverse). У моков отсутствуют.
  sourceUrl?: string; // оригинальная картинка источника или наш /api/uploads/…
  pageUrl?: string; // страница источника (атрибуция)
  license?: string; // напр. "by-sa 2.0"
  provider?: string; // напр. "flickr"
  // Поля пинов пользователей (id "up-…"). У остальных отсутствуют.
  userId?: string; // автор-пользователь (для «это мой пин»)
  authorAvatar?: string | null; // аватар автора из аккаунта
  saves?: number; // счётчик сохранений в доски
};

// Пины из чужих рук (содержимое досок, старые записи localStorage) могут
// приехать без размеров — дефолт нужен и для URL, и для next/image.
const DEFAULT_W = 800;
const DEFAULT_H = 1200;

export function pinImageSize(pin: Pick<Pin, "width" | "height">): [number, number] {
  return [pin.width || DEFAULT_W, pin.height || DEFAULT_H];
}

// Оригиналы источников отдаёт наш /api/img: flickr и wikimedia доступны
// только с сервера, плюс кэш на диске.
function proxyImage(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}

// Подпись источника: «flickr · CC by-sa 2.0». Лицензии у части источников нет
// (TheMealDB), и дописывать к пустому месту «CC » — значит соврать о правах.
// Формат значения разный у провайдеров: Openverse отдаёт «by-sa 2.0», Wikimedia
// — «CC BY-SA 4.0», поэтому CC дописываем только когда его нет в начале.
export function sourceLabel(pin: Pick<Pin, "provider" | "license">): string {
  const license = pin.license?.trim();
  const withCc = license ? (/^cc\b/i.test(license) ? license : `CC ${license}`) : "";
  return [pin.provider, withCc].filter(Boolean).join(" · ");
}

export function pinImageUrl(
  pin: Pick<Pin, "id" | "seed" | "width" | "height" | "sourceUrl">,
): string {
  if (pin.sourceUrl) {
    // Свои пины: картинка уже лежит на нашем /api/uploads/…
    if (pin.sourceUrl.startsWith("/")) return pin.sourceUrl;
    return proxyImage(pin.sourceUrl);
  }
  // Мок: picsum.photos напрямую даёт 403, поэтому через weserv.
  const [w, h] = pinImageSize(pin);
  return `https://images.weserv.nl/?url=picsum.photos/seed/${pin.seed || pin.id}/${w}/${h}&q=80`;
}
