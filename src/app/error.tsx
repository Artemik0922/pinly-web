"use client";

// Граница ошибок для всего приложения: без неё любая thrown-ошибка
// показывала бы пустой белый экран.

import Link from "next/link";
import { IconCompass } from "@/components/Icons";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-24 text-center">
      <p className="grid place-items-center text-muted">
        <IconCompass size={40} />
      </p>
      <h1 className="mt-4 text-xl font-bold">Что-то пошло не так</h1>
      <p className="mt-2 text-sm text-muted">
        Страница не отрисовалась. Можно попробовать ещё раз — или вернуться в ленту.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          Повторить
        </button>
        <Link
          href="/"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-muted hover:bg-surface"
        >
          В ленту
        </Link>
      </div>
    </div>
  );
}
