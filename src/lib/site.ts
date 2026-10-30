// Базовый адрес сайта: из него собираются canonical-ссылки и OG-URLы.
// В проде задаётся NEXT_PUBLIC_SITE_URL (иначе ссылки уходят на localhost).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

// Абсолютный адрес для og:image и JSON-LD: внутренние пути (/api/img,
// /api/uploads) получают домен, внешние (weserv) остаются как есть — иначе
// выходит «http://site/https://…».
export function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;
}
