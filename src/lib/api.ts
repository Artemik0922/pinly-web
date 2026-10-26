// Клиентские помощники доступа к данным через /api/feed.
// Серверные компоненты используют lib/feed.ts напрямую.

import type { Pin } from "@/data/pins";

export type FeedPage = {
  pins: Pin[];
  nextCursor: number | null;
};

export async function fetchFeedPage(opts: {
  category?: string;
  q?: string;
  cursor?: number;
}): Promise<FeedPage> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.q) params.set("q", opts.q);
  params.set("cursor", String(opts.cursor ?? 0));
  const res = await fetch(`/api/feed?${params}`);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return res.json();
}

export async function searchPins(query: string): Promise<Pin[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await fetchFeedPage({ q });
  return page.pins;
}
