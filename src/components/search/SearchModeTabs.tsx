"use client";

// Два режима поиска рядом: текстовый (обычный, работает всегда) и по картинке
// (нужен ключ эмбеддингов и индекс). Ссылки, а не кнопки, — чтобы режим
// сохранялся в URL и ссылкой можно было поделиться.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TAB = "rounded-full px-3 py-1 text-xs font-semibold";
const ACTIVE = "bg-foreground text-background";
const IDLE = "bg-surface text-muted hover:bg-surface-hover";

export function SearchModeTabs() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  return (
    <nav aria-label="Режим поиска" className="flex shrink-0 items-center gap-1.5">
      <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} className={`${TAB} ${!params.get("by") ? ACTIVE : IDLE}`}>
        По тексту
      </Link>
      <Link href="/search?by=image&pick=1" className={`${TAB} ${params.get("by") === "image" ? ACTIVE : IDLE}`}>
        По фото
      </Link>
    </nav>
  );
}
