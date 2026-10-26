"use client";

// Горизонтальная лента чипсов категорий над лентой.

import Link from "next/link";

export function CategoryChips({ active }: { active?: string }) {
  const cats = ["Все", "Интерьер", "Рецепты", "Путешествия", "Мода", "Искусство", "Природа", "Архитектура", "Рукоделие", "Фитнес", "Книги и рабочее место"];

  return (
    <nav className="mx-auto w-full max-w-[1800px] px-4 py-3">
      <ul className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cats.map((cat) => {
          const isActive = cat === "Все" ? !active : active === cat;
          const href = cat === "Все" ? "/" : `/?category=${encodeURIComponent(cat)}`;
          return (
            <li key={cat} className="shrink-0">
              <Link
                href={href}
                className={`block rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isActive ? "bg-black text-white" : "bg-surface text-foreground hover:bg-surface"
                }`}
              >
                {cat}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
