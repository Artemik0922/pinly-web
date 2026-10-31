// Сборка <title>/canonical/og для серверных generateMetadata. Конверт на
// всех страницах один и тот же, различаются только данные — поэтому и
// функция одна: расхождение в og.url или в alt картинки мессенджер прощает
// молча, и узнать об этом можно только через неделю пустых кликов.

import type { Metadata } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";

export type PageMeta = {
  title: string;
  description?: string;
  /** внутренний путь страницы: /board/abc — он же canonical и og.url */
  path: string;
  /** превью для ссылок в чатах: без og:image доска — серая полоска текста */
  imageUrl?: string;
  type?: "website" | "article";
  /** страница не для индекса (личные ленты, вкладки) */
  noIndex?: boolean;
};

export function pageMetadata({
  title,
  description,
  path,
  imageUrl,
  type = "website",
  noIndex,
}: PageMeta): Metadata {
  return {
    title,
    ...(description ? { description } : null),
    alternates: { canonical: path },
    ...(noIndex ? { robots: { index: false, follow: true } } : null),
    openGraph: {
      type,
      title,
      ...(description ? { description } : null),
      url: `${SITE_URL}${path}`,
      images: imageUrl ? [{ url: absoluteUrl(imageUrl), alt: title }] : undefined,
    },
  };
}

// Текст для <script type="application/ld+json">. Содержимое <script> парсер
// читает как сырой текст, а JSON.stringify угловые скобки не экранирует:
// заголовок пина вида «</script><img src=x onerror=…» закрывает блок раньше
// времени и становится разметкой страницы — stored XSS на публичной странице
// (подтверждён живым запросом 2026-10-31). Заменяем на \uXXXX-последовательности:
// для JSON это тот же символ, а HTML-парсер больше не видит закрывающего тега.
const JSON_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
};

export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&]/g, (ch) => JSON_ESCAPES[ch]);
}
