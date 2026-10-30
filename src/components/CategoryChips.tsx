"use client";

// Горизонтальная лента чипсов над лентой: подписки (для вошедших) и категории.

import Link from "next/link";
import { useUser } from "@/lib/user";
import { CATEGORY_PAGES, categoryHref } from "@/lib/categories";

// Список берётся из CATEGORY_PAGES: чипс, маршрут /category/<slug> и sitemap
// должны сходиться по именам, иначе часть категорий останется без индекса.
const CATS = ["Все", ...CATEGORY_PAGES.map((page) => page.name)];

export function CategoryChips({ active, feed }: { active?: string; feed?: string }) {
  const { user, enabled } = useUser();
  const subscriptions = feed === "subscriptions";

  const chip = (label: string, href: string, isActive: boolean) => (
    <li key={label} className="shrink-0">
      <Link
        href={href}
        scroll={false}
        aria-current={isActive ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
          isActive
            ? "bg-foreground text-white"
            : "bg-surface text-foreground hover:bg-surface-hover"
        }`}
      >
        {label}
      </Link>
    </li>
  );

  return (
    <nav aria-label="Категории ленты" className="relative mx-auto w-full max-w-[1800px] px-4 py-1">
      {/* градиент справа подсказывает, что ленту чипсов можно крутить */}
      <ul
        className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x proximity" }}
      >
        {enabled && user && chip("Подписки", "/?feed=subscriptions", subscriptions)}
        {CATS.map((cat) =>
          chip(
            cat,
            cat === "Все" ? "/" : categoryHref(cat),
            !subscriptions && (cat === "Все" ? !active : active === cat),
          ),
        )}
      </ul>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-0 w-10 bg-gradient-to-l from-background to-transparent sm:hidden"
      />
    </nav>
  );
}
