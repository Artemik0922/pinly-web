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

type Result = { q: string; pins: Pin[] };

function SearchResults() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    let settled = false;
    searchPins(q, controller.signal)
      .then((pins) => {
        if (settled) return;
        setResult({ q, pins });
        setError(null);
      })
      .catch(() => {
        if (!settled) setError("Поиск не выполнился — сервер ленты недоступен.");
      });
    return () => {
      settled = true;
      controller.abort();
    };
  }, [q, attempt]);

  // Ответ ещё не по текущему запросу — значит ищем.
  const loading = !error && result?.q !== q;
  const pins = result?.q === q ? result.pins : [];

  return (
    <>
      <CategoryChips />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        <h1 className="py-2 text-lg font-bold">
          {q ? `Поиск: «${q}»` : "Что ищем?"}
          {pins.length > 0 && <span className="ml-2 font-normal text-muted">{pins.length}</span>}
        </h1>

        {loading && <p className="py-10 text-center text-sm text-muted">Ищем…</p>}

        {error && (
          <div className="py-10 text-center text-sm">
            <p className="text-danger" role="alert">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setResult(null);
                setAttempt((n) => n + 1);
              }}
              className="mt-3 rounded-full bg-foreground px-5 py-2 font-semibold text-background hover:opacity-90"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && pins.length > 0 && (
          <div className="mt-4">
            <MasonryGrid pins={pins} />
          </div>
        )}

        {!loading && !error && q && pins.length === 0 && (
          <div className="py-16 text-center">
            <p className="grid place-items-center text-muted">
              <IconQuestion size={40} />
            </p>
            <p className="mt-3 text-muted">
              По запросу «{q}» ничего не нашлось. Попробуйте категорию или тег.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
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
    <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Загрузка…</p>}>
      <SearchResults />
    </Suspense>
  );
}
