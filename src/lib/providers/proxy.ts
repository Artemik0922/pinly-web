// Прокси внешних картинок.
// flickr/wikimedia доступны с сервера напрямую — отдаём их через свой
// маршрут /api/img с дисковым кэшем (быстро и без внешних сервисов).

import { createHash } from "node:crypto";

export function proxyImage(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}

export function imageHash(url: string): string {
  return createHash("md5").update(url).digest("hex");
}
