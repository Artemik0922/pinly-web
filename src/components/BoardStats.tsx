"use client";

// Цифры по доске для её владельца. Модель рекламная, но мастеру нужен не
// доход, а ответ на один вопрос: привела ли расшаренная ссылка чужих людей.
// Свои просмотры бэкенд считает отдельно — иначе человек меряет себя.

import { useEffect, useState } from "react";
import { countLabel } from "@/lib/plural";

type Stats = {
  days: number;
  daily: { day: string; views: number; foreignViews: number; visitors: number }[];
  totals: {
    views: number;
    foreignViews: number;
    visitorDays: number;
    activeDays: number;
    shares: number;
  };
  sources: { channel: string; views: number; visitors: number }[];
};

export function BoardStats({ boardId }: { boardId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  // Сводка нужна редкому человеку и не всем, кто открыл доску: просим её
  // только когда панель развернули.
  useEffect(() => {
    if (!opened || stats) return;
    const controller = new AbortController();
    fetch(`/api/ev/board?board=${encodeURIComponent(boardId)}&days=14`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: Stats) => setStats(data))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError("Цифры не загрузились.");
      });
    return () => controller.abort();
  }, [opened, stats, boardId]);

  const days = stats?.daily.filter((d) => d.foreignViews > 0).slice(0, 7) ?? [];

  return (
    <details
      className="mx-auto mt-4 max-w-2xl rounded-2xl bg-surface px-4 py-3 text-left"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold">Цифры доски</summary>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {!error && !stats && <p className="mt-2 text-sm text-muted">Счита…</p>}

      {stats && (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            {stats.totals.foreignViews > 0 ? (
              <>
                {countLabel(stats.totals.foreignViews, "чужое открытие", "чужих открытия", "чужих открытий")} за{" "}
                {countLabel(stats.days, "день", "дня", "дней")}, своих —{" "}
                {stats.totals.views - stats.totals.foreignViews}.
              </>
            ) : (
              <>
                За {countLabel(stats.days, "последний день", "последних дня", "последних дней")} доску
                открывали только вы. Ссылку ещё не несут.
              </>
            )}
          </p>
          <p className="text-muted">
            {countLabel(stats.totals.activeDays, "день", "дня", "дней")} с гостями ·{" "}
            {countLabel(stats.totals.shares, "раз", "раза", "раз")} копировали ссылку
          </p>

          {stats.sources.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {stats.sources.map((s) => (
                <li key={s.channel} className="text-muted">
                  {s.channel} — {s.views}
                </li>
              ))}
            </ul>
          )}

          {days.length > 0 && (
            <ul className="text-xs text-muted">
              {days.map((d) => (
                <li key={d.day} className="flex justify-between gap-4 border-b border-black/5 py-1 last:border-0">
                  <span>{d.day}</span>
                  <span>
                    {d.foreignViews} / {d.visitors}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted">
            Ссылку из чата видно как «напрямую», если в ней нет пометки <code>?from=</code> — она
            добавляется сама, когда жмёшь «Поделиться».
          </p>
        </div>
      )}
    </details>
  );
}
