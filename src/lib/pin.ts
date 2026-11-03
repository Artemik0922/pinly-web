// Модель пина: контракт, который разделяют моки, внешние источники
// (Openverse, музеи, Wikimedia), загрузки пользователей и клиентские карточки.
// Модуль клиент-безопасен: никаких node-импортов — из него собирают URL
// карточки в браузере.

import { MAX_SLIDES } from "@/lib/upload-limits";

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
  // Носители пина: слайды, которые перелистывают, и видео. Пусто у внешних
  // источников и у всего, что создано до этой функции, — тогда карточка
  // живёт на sourceUrl (см. pinSlides).
  slides?: PinSlide[];
};

export type PinSlide = {
  kind: "image" | "video";
  url: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number;
  posterUrl?: string; // у видео: кадр-обложка; без него <video> сам покажет первый
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

/**
 * Носители пина в одном виде: всегда хотя бы один слайд.
 *
 * У пинов без таблицы носителей (внешние источники, всё созданное раньше)
 * единственный слайд — обложка, поэтому карточке не нужны две ветки рендера.
 */
export function pinSlides(pin: Pin): PinSlide[] {
  // Потолок слайдов сервер проверяет при создании, но доска хранит снапшот
  // карточки, присланный клиентом: без среза один чужой ответ превратил бы
  // карточку в ленту из сотни узлов.
  if (pin.slides?.length) return pin.slides.slice(0, MAX_SLIDES);
  const [w, h] = pinImageSize(pin);
  return [{ kind: "image", url: pinImageUrl(pin), width: w, height: h }];
}

export function pinHasVideo(pin: Pin): boolean {
  return Boolean(pin.slides?.some((slide) => slide.kind === "video"));
}

/** Понятная длина видео на бейдже: 0:07, 1:05, 1:02:03. */
export function formatMediaDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
