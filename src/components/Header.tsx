"use client";

// Шапка: логотип, поиск, навигация, меню пользователя. Липкая, белая.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconSearch } from "@/components/Icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUser } from "@/lib/user";
import { getSupabase } from "@/lib/supabase/client";

function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/");
      }}
    >
      <label className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 focus-within:ring-2 focus-within:ring-accent/40">
        <IconSearch size={16} className="shrink-0 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const query = q.trim();
              router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/");
            }
          }}
          placeholder="Найти идеи…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      </label>
    </form>
  );
}

// Ссылки подсвечивают активную страницу через usePathname —
// динамический хук, поэтому под Suspense (иначе ломает пререндер).
function NavLinks() {
  const pathname = usePathname();

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        pathname === href ? "bg-foreground text-background" : "text-foreground hover:bg-surface"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      {link("/", "Главная")}
      {link("/boards", "Доски")}
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserMenu() {
  const { user, ready, enabled } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!ready || !enabled) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Войти
      </Link>
    );
  }

  const name =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Профиль";

  const logout = async () => {
    await getSupabase()!.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню пользователя"
        className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-bold text-white"
      >
        {initials(name)}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl bg-background p-2 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
          <div className="border-b border-border-soft px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
          <Link
            href={`/profile/${user.id}`}
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Мой профиль
          </Link>
          <Link
            href="/boards"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Мои доски
          </Link>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface"
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1800px] items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-lg font-black text-white">
            P
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:block">
            Pinly
          </span>
        </Link>
        <Suspense
          fallback={<div className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2.5" aria-hidden />}
        >
          <SearchBar />
        </Suspense>
        <nav className="flex shrink-0 items-center">
          <Suspense fallback={<div className="h-9 w-[168px]" aria-hidden />}>
            <NavLinks />
          </Suspense>
          <ThemeToggle />
          <Suspense fallback={<div className="ml-3 h-9 w-9" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
