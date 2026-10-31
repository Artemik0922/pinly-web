"use client";

// Результаты поиска по названию, описанию, тегам и категории.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import type { Pin } from "@/lib/pin";
import { searchPins } from "@/lib/api/feed";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { CategoryChips } from "@/components/ui/CategoryChips";
import { IconQuestion } from "@/components/ui/Icons";
import { PhotoSearch } from "@/components/search/PhotoSearch";
import { SearchModeTabs } from "@/components/search/SearchModeTabs";

type Result = { q: string; pins: Pin[] };

// Заголовок и переключатель режима — в одну строку: две строки подряд ради
// пары кнопок съедали место, где могла быть первая карточка.
function SearchHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-x-3 px-4">
      <h1 className="min-w-0 truncate py-1 text-base font-bold sm:text-lg">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2 font-normal text-muted">{count}</span>
        )}
      </h1>
      <SearchModeTabs />
    </div>
  );
}

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";
  const byPhoto = params.get("by") === "image";
  // pick=1 — режим открыли по ссылке из шапки или по вкладке «По фото»:
  // меню источников разворачивают сразу, лишний тап не нужен.
  const pick = params.get("pick") === "1";
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

  if (byPhoto) {
    return (
      <>
        <CategoryChips />
        <SearchHeading title="Поиск по фото" />
        <PhotoSearch
          autoOpen={pick}
          onAutoOpenHandled={() => router.replace("/search?by=image")}
        />
      </>
    );
  }

  return (
    <>
      <CategoryChips />
      <SearchHeading title={q ? `Поиск: «${q}»` : "Что ищем?"} count={pins.length} />
      <div className="mx-auto w-full max-w-[1800px] px-4">
        {loading && <p className="py-6 text-center text-sm text-muted">Ищем…</p>}

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
          <div className="mt-2">
            <MasonryGrid pins={pins} />
          </div>
        )}

        {!loading && !error && q && pins.length === 0 && (
          <div className="py-10 text-center">
            <p className="grid place-items-center text-muted">
              <IconQuestion size={32} />
            </p>
            <p className="mt-2 text-muted">
              По запросу «{q}» ничего не нашлось. Попробуйте категорию или тег.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
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
