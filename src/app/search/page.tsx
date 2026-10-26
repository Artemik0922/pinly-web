"use client";

// Результаты поиска по названию, описанию, тегам и категории.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import type { Pin } from "@/data/pins";
import { searchPins } from "@/lib/api";
import { MasonryGrid } from "@/components/MasonryGrid";
import { CategoryChips } from "@/components/CategoryChips";
import { IconQuestion } from "@/components/Icons";

function SearchResults() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPins(q).then((result) => {
      if (!cancelled) {
        setPins(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <>
      <CategoryChips />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        <h1 className="py-2 text-lg font-bold">
          {q ? `Поиск: «${q}»` : "Что ищем?"}
          {pins.length > 0 && <span className="ml-2 font-normal text-muted/80">{pins.length}</span>}
        </h1>

        {loading && <p className="py-10 text-center text-sm text-muted/80">Ищем…</p>}

        {!loading && pins.length > 0 && (
          <div className="mt-4">
            <MasonryGrid pins={pins} />
          </div>
        )}

        {!loading && q && pins.length === 0 && (
          <div className="py-16 text-center">
            <p className="grid place-items-center text-muted">
              <IconQuestion size={40} />
            </p>
            <p className="mt-3 text-muted">
              По запросу «{q}» ничего не нашлось. Попробуйте категорию или тег.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Вернуться в ленту
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted/80">Загрузка…</p>}>
      <SearchResults />
    </Suspense>
  );
}
