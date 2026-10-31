// Wikimedia Commons: точные размеры и лицензия через imageinfo, автора берём
// из extmetadata (он приходит HTML).

import { cached } from "@/lib/server/providers/cache";
import type { Pin } from "@/lib/pin";
import { UA } from "@/lib/server/providers/ua";

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, " ")
    .trim()
    .slice(0, 80);
}

// ── Wikimedia Commons напрямую: точные размеры и лицензия ──────────────

type CommonsPage = {
  pageid: number;
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    extmetadata?: {
      LicenseShortName?: { value?: string };
      Artist?: { value?: string };
    };
  }>;
};

export async function commonsPins(
  query: string,
  category: string,
  page: number,
  count = 6,
): Promise<Pin[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: String(count),
      gsroffset: String((page - 1) * count),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "800",
      iiextmetadatafilter: "LicenseShortName|Artist",
    });
    const data = await cached<{ query?: { pages?: Record<string, CommonsPage> } }>(
      `wc:${query}:${page}:${count}`,
      async () => {
        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
          headers: UA,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`commons ${res.status}`);
        return (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
      },
    );
    const pages = Object.values(data.query?.pages ?? {});
    const pins = pages
      .map((p): Pin | null => commonsPinFrom(p, category))
      .filter((p): p is Pin => p !== null);
    return pins;
  } catch {
    return [];
  }
}

function commonsPinFrom(p: CommonsPage, category: string): Pin | null {
  const ii = p.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const license = ii.extmetadata?.LicenseShortName?.value ?? "";
  if (/non-free|fair use/i.test(license)) return null;
  const title = (p.title || "").replace(/^File:/, "").replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, "");
  return {
    id: `wc-${p.pageid}`,
    title: title.slice(0, 120) || "Из Wikimedia Commons",
    description: "",
    category,
    tags: license ? [license.toLowerCase().slice(0, 24)] : [],
    author: stripHtml(ii.extmetadata?.Artist?.value) || "Wikimedia Commons",
    width: ii.width || 800,
    height: ii.height || 1000,
    seed: String(p.pageid),
    likes: 0,
    sourceUrl: ii.thumburl,
    pageUrl: ii.descriptionurl,
    license: license || undefined,
    provider: "commons",
  };
}

// Деталь по pageid: тот же запрос imageinfo, но без генератора поиска.
// Категория по pageid не восстанавливается — берём нейтральную «идеи».
export async function getCommonsPin(pageid: string): Promise<Pin | undefined> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      pageids: pageid,
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "800",
      iiextmetadatafilter: "LicenseShortName|Artist",
    });
    const data = await cached<{ query?: { pages?: Record<string, CommonsPage> } }>(
      `wc-id:${pageid}`,
      async () => {
        const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
          headers: UA,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`commons ${res.status}`);
        return (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
      },
    );
    const pages = Object.values(data.query?.pages ?? {});
    for (const p of pages) {
      const pin = commonsPinFrom(p, "идеи");
      if (pin) return pin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
