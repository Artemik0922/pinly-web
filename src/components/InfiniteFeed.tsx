"use client";

// Бесконечная лента: первая порция может прийти с сервера (SSR),
// дальше — догрузка по 20 пинов, когда сентинел появляется
// в зоне видимости (с запасом 600px).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Pin } from "@/data/pins";
import { fetchFeedPage } from "@/lib/api";
import { MasonryGrid } from "@/components/MasonryGrid";
import { SkeletonGrid } from "@/components/SkeletonGrid";

export function InfiniteFeed({
  category,
  initialPins,
  initialCursor,
}: {
  category?: string;
  initialPins?: Pin[];
  initialCursor?: number | null;
}) {
  const hasInitial = initialPins !== undefined;
  const [pins, setPins] = useState<Pin[]>(initialPins ?? []);
  const [cursor, setCursor] = useState<number | null>(hasInitial ? initialCursor ?? null : 0);
  const [loading, setLoading] = useState(!hasInitial);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(
    async (cur: number) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      try {
        const page = await fetchFeedPage({ category, cursor: cur });
        setPins((prev) => {
          // Разные запросы Openverse могут вернуть одну картинку —
          // дубли на стыке страниц убираем.
          const seen = new Set(cur === 0 ? [] : prev.map((p) => p.id));
          const fresh = page.pins.filter((p) => !seen.has(p.id));
          const merged = cur === 0 ? page.pins : [...prev, ...fresh];
          return merged;
        });
        setCursor(page.nextCursor);
      } catch {
        setCursor(null);
      } finally {
        setLoading(false);
        busy.current = false;
      }
    },
    [category],
  );

  // Компонент монтируется заново при смене категории (key),
  // поэтому начальная загрузка нужна только когда нет серверной порции.
  useEffect(() => {
    if (hasInitial) return;
    loadMore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || cursor === null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore(cursor);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  return (
    <div>
      {pins.length === 0 && loading ? (
        <SkeletonGrid />
      ) : (
        <MasonryGrid pins={pins} />
      )}
      <div ref={sentinel} className="h-2" />
      {loading && pins.length > 0 && (
        <p className="py-6 text-center text-sm text-muted/80">Загрузка…</p>
      )}
      {!loading && cursor === null && pins.length > 0 && (
        <p className="py-8 text-center text-sm text-muted/80">Это всё</p>
      )}
    </div>
  );
}
