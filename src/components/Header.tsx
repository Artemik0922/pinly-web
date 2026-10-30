"use client";

// Шапка: логотип, поиск, навигация, меню пользователя. Липкая, белая.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IconBell, IconPlus, IconSearch } from "@/components/Icons";
import { LogoMark } from "@/components/LogoMark";
import { initialsOf } from "@/components/Avatar";
import { apiNotificationsCount } from "@/lib/account";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUser } from "@/lib/user";

// Кнопка «создать пин» — только для вошедших.
function CreateButton() {
  const { user, ready, enabled } = useUser();
  if (!ready || !enabled || !user) return null;
  return (
    <Link
      href="/pin/new"
      aria-label="Создать пин"
      className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-background hover:opacity-90 sm:h-9 sm:w-9"
    >
      <IconPlus size={18} />
    </Link>
  );
}

function SearchBar() {
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
    <form
      className="min-w-0 flex-1"
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
      </label>
    </form>
  );
}

// Ссылки подсвечивают активную страницу через usePathname —
// динамический хук, поэтому он под Suspense (иначе ломает пререндер).
function NavLinks() {
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

// Колокольчик личных уведомлений: непрочитанных всегда видно ровно столько,
// сколько их есть. Счётчик обновляется раз в 45 секунд и при смене страницы.
function NotificationBell() {
  const { user, ready, enabled } = useUser();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!ready || !enabled || !user) return;
    let alive = true;
    const load = () => {
      apiNotificationsCount()
        .then((n) => {
          if (alive) setUnread(n);
        })
        .catch(() => undefined); // бэкенд мигнул — просто не мигаем
    };
    load();
    const timer = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ready, enabled, user, pathname]);

  if (!ready || !enabled || !user) return null;

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? `Уведомления: ${unread} непрочитанных` : "Уведомления"
      }
      className="relative grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-surface-hover sm:h-9 sm:w-9"
    >
      <IconBell size={20} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-bold leading-5 text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

function UserMenu() {
  const { user, ready, enabled, signOut } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready || !enabled) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex min-h-11 items-center rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
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
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню пользователя"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-sm font-bold text-background sm:h-9 sm:w-9"
      >
        {initialsOf(name)}
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-11 z-50 w-52 rounded-2xl bg-background p-2 shadow-overlay ring-1 ring-border-soft "
        >
          <div className="border-b border-border-soft px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Link
            href={`/profile/${user.id}`}
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Мой профиль
          </Link>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Уведомления
          </Link>
          <Link
            href="/media"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Медиатека
          </Link>
          <Link
            href="/boards"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
          >
            Мои доски
          </Link>
          <button
            type="button"
            onClick={logout}
            role="menuitem"
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
        <Link href="/" aria-label="Pinly — на главную" className="flex shrink-0 items-center gap-2">
          <LogoMark className="h-9 w-9 text-foreground" />
          <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:block">
            Pinly
          </span>
        </Link>
        <Suspense
          fallback={
            <div className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2.5" aria-hidden />
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
