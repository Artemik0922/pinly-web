"use client";

// Страница поиска: поле, переключатель режима, источник фото и результаты —
// в одной колонке по центру. Раньше заголовок жался слева, вкладки улетали к
// правому краю контейнера на 1800 px, а между ними висела пустота.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { InfiniteFeed } from "@/components/feed/InfiniteFeed";
import { CategoryChips } from "@/components/ui/CategoryChips";
import { IconQuestion, IconSearch } from "@/components/ui/Icons";
import { PhotoDropZone, PhotoResults } from "@/components/search/PhotoPanel";
import { PhotoSourceMenu } from "@/components/search/PhotoSourceMenu";
import { SearchModeTabs } from "@/components/search/SearchModeTabs";
import { usePhotoSearch } from "@/components/search/usePhotoSearch";

// Ширина панели: на 1920 px строка поиска во всю ширину превращается в бегущую
// полосу, где поле и кнопка не видны одновременно.
const PANEL = "mx-auto w-full max-w-[1120px] px-4";

function SearchField({ q }: { q: string }) {
  const router = useRouter();
  // Пока пользователь не печатал, поле живёт по URL (переходы по тегам и чипам
  // подставляют запрос). Состояние из эффекта здесь только плодит рассинхрон.
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? q;

  const submit = () => {
    const query = value.trim();
    setTyped(null);
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex h-11 w-full min-w-[200px] items-center gap-2 rounded-full bg-surface px-4 focus-within:ring-2 focus-within:ring-accent/40 sm:h-10 sm:w-auto sm:max-w-[560px] sm:flex-1"
    >
      <IconSearch size={16} className="shrink-0 text-muted" />
      <input
        value={value}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Найти идеи…"
        aria-label="Поиск пинов"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => setTyped("")}
          aria-label="Очистить запрос"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover"
        >
          ×
        </button>
      )}
    </form>
  );
}

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";
  const byPhoto = params.get("by") === "image";
  // pick=1 — в режим вошли по ссылке из шапки или по вкладке «По фото»: меню
  // источников разворачивают сразу, лишний тап не нужен.
  const pick = params.get("pick") === "1";

  const photo = usePhotoSearch(byPhoto);
  // Счётчик отдаёт InfiniteFeed: страницы выдачи он знает, а заголовок — нет.
  const [shown, setShown] = useState(0);

  return (
    <>
      <CategoryChips />
      <div className={PANEL}>
        <h1 className="pt-4 text-sm font-semibold text-muted">
          {byPhoto ? "Поиск по фото" : q ? `Поиск: «${q}»` : "Что ищем?"}
          {!byPhoto && shown > 0 && <span className="ml-2">{shown}</span>}
        </h1>

        {/* Всё управление в одну строку: поле, режим, источник фото. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SearchField q={q} />
          <SearchModeTabs />
          {byPhoto && (
            <PhotoSourceMenu
              onFile={photo.run}
              onError={photo.setError}
              autoOpen={pick}
              onCloseAutoOpen={() => router.replace("/search?by=image")}
            />
          )}
        </div>

        {byPhoto ? (
          <>
            <PhotoDropZone state={photo} />
            {!photo.busy && <PhotoResults pins={photo.pins} />}
          </>
        ) : !q.trim() ? (
          <p className="mt-3 text-sm text-muted">
            Печатайте запрос — ищем по названию, описанию, тегам и категории.
          </p>
        ) : (
          // key по запросу: новая выдача обязана начаться с первой страницы,
          // а не догружаться к прошлому поиску. Курсор, обрыв запроса при
          // уходе и дубли на стыке страниц умеет InfiniteFeed.
          <div className="mt-4">
            <InfiniteFeed
              key={q}
              q={q}
              onCount={setShown}
              empty={
                <>
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
                </>
              }
            />
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
