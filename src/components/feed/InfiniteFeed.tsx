"use client";

// Бесконечная лента: первая порция может прийти с сервера (SSR), дальше —
// догрузка по 20 пинов, когда сентинел попадает в зону видимости (600px).
//
// Три вещи, без которых лента «бесконечна» буквально:
// • сетевой сбой — не «конец ленты»: показываем ошибку и «Повторить»;
// • потолок в MAX_VISIBLE пинов с кнопкой «Показать ещё» — DOM и память
// не растут всю сессию;
// • AbortController — смена категории или уход со страницы обрывают запрос,
// а не оставляют его догружаться в никуда.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Pin } from "@/lib/pin";
import { fetchFeedPage } from "@/lib/api/feed";
import { MasonryGrid } from "@/components/ui/MasonryGrid";

const MAX_VISIBLE = 300;

export function InfiniteFeed({
  category,
  q,
  initialPins,
  initialCursor,
  empty,
  onCount,
}: {
  category?: string;
  /** Поисковый запрос: тот же /api/feed и тот же курсор, только выдача по q. */
  q?: string;
  initialPins?: Pin[];
  initialCursor?: number | null;
  /** Чем заменить «ничего нет», когда у выдачи свой текст. У поиска это
   *  «по запросу … ничего не нашлось», а не «источник молчит». */
  empty?: ReactNode;
  /** Сколько карточек сейчас показано. Состояние страниц живёт здесь, а
   *  счётчик — в заголовке родителя, поэтому он просит его вернуть. */
  onCount?: (shown: number) => void;
}) {
  const hasInitial = initialPins !== undefined;
  const [pins, setPins] = useState<Pin[]>(initialPins ?? []);
  const [cursor, setCursor] = useState<number | null>(hasInitial ? (initialCursor ?? null) : 0);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState(MAX_VISIBLE);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const loadMore = useCallback(
    async (cur: number) => {
      if (busy.current) return;
      busy.current = true;
      controller.current?.abort();
      const signal = (controller.current = new AbortController()).signal;
      try {
        const page = await fetchFeedPage({ category, q, cursor: cur, signal });
        setPins((prev) => {
          // Разные запросы Openverse могут вернуть одну картинку —
          // дубли на стыке страниц убираем.
          const seen = new Set(cur === 0 ? [] : prev.map((p) => p.id));
          const fresh = page.pins.filter((p) => !seen.has(p.id));
          return cur === 0 ? page.pins : [...prev, ...fresh];
        });
        setCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Лента не догрузилась — проверьте соединение или бэкенд.");
        }
      } finally {
        setLoading(false);
        busy.current = false;
      }
    },
    [category, q],
  );

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  // Счётчик для заголовка родителя: stable setState из useState, поэтому
  // эффект не заводит цикл.
  useEffect(() => {
    onCount?.(pins.length);
  }, [onCount, pins.length]);

  // Начальная загрузка — тот же наблюдатель: без серверной порции сентинел
  // виден сразу, поэтому первая страница приходит в первом же проходе.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || cursor === null || pins.length >= cap) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setLoading(true);
        loadMore(cursor);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore, pins.length, cap]);

  const retry = () => {
    // При пустой первой порции курсор null («страниц больше нет»), но начинать
    // надо с нуля — иначе «Повторить» была бы мёртвой кнопкой.
    const cur = cursor ?? 0;
    setLoading(true);
    loadMore(cur);
  };

  const reachedCap = pins.length >= cap && cursor !== null;
  // Пустая выдача без ошибки и без загрузки, и курсор говорит «страниц больше
  // нет» = источник отдал ноль пинов. Без этой ветки человек видел белый экран
  // и ни одного объяснения. Условие по cursor нужно, чтобы не мигать подсказкой
  // на пустой серверной порции, из которой лента ещё догрузится.
  const noResults = !loading && !error && pins.length === 0 && cursor === null;

  return (
    <div>
      {/* Без скелетонов: пока пинов нет (первая загрузка), — строка «Загрузка…»,
          карточки появляются только с готовыми картинками */}
      {pins.length > 0 && (
        <MasonryGrid pins={reachedCap ? pins.slice(0, cap) : pins} />
      )}
      <div ref={sentinel} className="h-2" />
      {loading && <p className="py-6 text-center text-sm text-muted">Загрузка…</p>}
      {error && (
        <div className="py-6 text-center text-sm">
          <p className="text-danger" role="alert">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full bg-foreground px-5 py-2 font-semibold text-background hover:opacity-90"
          >
            Повторить
          </button>
        </div>
      )}
      {noResults && (
        <div className="py-16 text-center">
          {empty ?? (
            <>
              <p className="text-muted">
                Лента не заполнилась — источник картинок ничего не вернёт. Попробуйте
                ещё раз или зайдите позже.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 rounded-full bg-foreground px-5 py-2 font-semibold text-background hover:opacity-90"
              >
                Повторить
              </button>
            </>
          )}
        </div>
      )}
      {reachedCap && !loading && (
        <button
          type="button"
          onClick={() => setCap((c) => c + MAX_VISIBLE)}
          className="mx-auto mt-4 block rounded-full bg-surface px-6 py-3 text-sm font-semibold hover:bg-surface-card"
        >
          Показать ещё
        </button>
      )}
      {!loading && !error && !reachedCap && cursor === null && pins.length > 0 && (
        <p className="py-8 text-center text-sm text-muted">Это всё</p>
      )}
    </div>
  );
}
