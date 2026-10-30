// Прокси внешних картинок.
// flickr/wikimedia доступны с сервера напрямую — отдаём их через свой
// маршрут /api/img с дисковым кэшем (быстро и без внешних сервисов).
// Здесь же единые правила этого прокси: список хостов, лимит размера и
// определение типа по байтам (кэш хранит .bin без метаданных).

import { createHash } from "node:crypto";

export function proxyImage(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}

export function imageHash(url: string): string {
  return createHash("md5").update(url).digest("hex");
}

// Разрешённые хосты источников изображений. Матчим точно по домену или
// поддомену: `/flickr\.com$/` пропускал evil-flickr.com, а endswith по хвосту
// — любой адрес, заканчивающийся на нужную строку.
const ALLOWED_IMG_HOSTS = [
  "staticflickr.com",
  "flickr.com",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "thumb.wikimedia.org",
  "images.metmuseum.org",
  "openaccess-cdn.clevelandart.org",
  "themealdb.com",
  "www.themealdb.com",
  "i.ibb.co", // CDN бесплатного хостинга ImgBB
];

export function isAllowedImgHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_IMG_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

// Потолок одного файла: без него один запрос может забить .cache/img.
export const MAX_IMG_BYTES = 15 * 1024 * 1024;

// Тип по сигнатуре — так же, как в backend/images.py: файлы кэша не хранят
// заголовки апстрима, а отдавать их надо честно.
export function sniffImageType(buf: Uint8Array): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (
    buf.length > 12 &&
    String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === "RIFF" &&
    String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
