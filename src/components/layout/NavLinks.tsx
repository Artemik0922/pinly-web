"use client";

// Основные ссылки навигации.

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ссылки подсвечивают активную страницу через usePathname —
// динамический хук, поэтому он под Suspense (иначе ломает пререндер).
export function NavLinks() {
  const pathname = usePathname();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        pathname === href
          ? "bg-foreground text-background"
          : "text-foreground hover:bg-surface-hover"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      {link("/", "Главная")}
      {link("/subscriptions", "Подписки")}
      {link("/boards", "Доски")}
    </>
  );
}
