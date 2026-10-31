// Клиентская лента через /api/feed (Node-роутер, который отдаёт ту же
// страницу, что серверные страницы собирают напрямую из lib/server/feed).

import type { Pin } from "@/lib/pin";

import type { FeedPage } from "@/lib/feed-page";

export type { FeedPage };

export async function fetchFeedPage(opts: {
  category?: string;
  q?: string;
  cursor?: number;
  signal?: AbortSignal;
}): Promise<FeedPage> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.q) params.set("q", opts.q);
  params.set("cursor", String(opts.cursor ?? 0));
  const res = await fetch(`/api/feed?${params}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return (await res.json()) as FeedPage;
}

export async function searchPins(query: string, signal?: AbortSignal): Promise<Pin[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await fetchFeedPage({ q, signal });
  return page.pins;
}
