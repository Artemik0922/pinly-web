"use client";

// Поиск шапки: на мобильном — иконка, ведущая на страницу поиска, на sm+ —
// прежнее поле.

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { IconCamera, IconSearch } from "@/components/ui/Icons";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  // Пока пользователь не печатал, поле живёт по URL (переходы по тегам и
  // чипам подставляют запрос). Состояние из эффекта здесь только плодит
  // лишний рендер и рассинхрон при быстрых переходах.
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? params.get("q") ?? "";

  const go = () => {
    const query = value.trim();
    setTyped(null);
    router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/");
  };

  return (
    <>
      {/* На мобильном в шапке нет места на широкое поле: пять кнопок +
          логотип съедают строку, поле сжималось до иконки-кружка. Там поиск
          — иконкой на страницу поиска, на sm+ — прежнее поле. */}
      <div className="flex shrink-0 items-center gap-1 sm:hidden">
        <Link
          href="/search"
          aria-label="Поиск пинов"
          className="grid h-11 w-11 place-items-center rounded-full bg-surface"
        >
          <IconSearch size={18} className="text-muted" />
        </Link>
        <Link
          href="/search?by=image"
          aria-label="Поиск по фото"
          className="grid h-11 w-11 place-items-center rounded-full bg-surface"
        >
          <IconCamera size={18} className="text-muted" />
        </Link>
      </div>
      <form
        className="hidden min-w-0 flex-1 sm:block"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <label className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 focus-within:ring-2 focus-within:ring-accent/40">
          <IconSearch size={16} className="shrink-0 text-muted" />
          <input
            value={value}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go();
              }
            }}
            placeholder="Найти идеи…"
            aria-label="Поиск пинов"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <Link
            href="/search?by=image"
            aria-label="Поиск по фото"
            title="Поиск по фото"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover"
          >
            <IconCamera size={17} />
          </Link>
        </label>
      </form>
    </>
  );
}
