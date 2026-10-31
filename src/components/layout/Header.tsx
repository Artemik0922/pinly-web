"use client";

// Шапка: логотип, поиск, навигация, меню пользователя. Липкая, белая.
// Регионы — свои файлы рядом (SearchBar, NavLinks, UnreadBadges,
// CreateButton, UserMenu), здесь только сборка и Suspense-границы: каждый
// регион читает динамический хук, поэтому без пререндера не обходится.

import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/ui/LogoMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CreateButton } from "@/components/layout/CreateButton";
import { NavLinks } from "@/components/layout/NavLinks";
import { SearchBar } from "@/components/layout/SearchBar";
import { MessagesLink, NotificationBell } from "@/components/layout/UnreadBadges";
import { UserMenu } from "@/components/layout/UserMenu";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="Pinly — на главную" className="flex shrink-0 items-center gap-2">
          <LogoMark className="h-9 w-9 text-foreground" />
          <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:block">
            Pinly
          </span>
        </Link>
        <Suspense
          fallback={
            <div
              aria-hidden
              className="h-11 w-11 shrink-0 rounded-full bg-surface sm:h-9 sm:min-w-0 sm:flex-1"
            />
          }
        >
          <SearchBar />
        </Suspense>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* На мобильном текстовой навигации нет: строка не вмещает
              логотип + поиск + две ссылки + три кнопки. Профили и доски
              доступны из меню пользователя, лента — по логотипу. */}
          <div className="hidden items-center gap-3 sm:flex">
            <Suspense fallback={<div className="h-9 w-[168px]" aria-hidden />}>
              <NavLinks />
            </Suspense>
          </div>
          <ThemeToggle />
          <Suspense fallback={null}>
            <MessagesLink />
          </Suspense>
          <Suspense fallback={null}>
            <NotificationBell />
          </Suspense>
          <Suspense fallback={null}>
            <CreateButton />
          </Suspense>
          <Suspense fallback={<div className="h-9 w-9" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
