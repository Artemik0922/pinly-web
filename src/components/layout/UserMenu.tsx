"use client";

// Меню пользователя: гостю — кнопка входа, вошедшему — аватар-иконка с
// выпадающим списком разделов и выходом.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconUser } from "@/components/ui/Icons";
import { useUser } from "@/lib/state/session";

export function UserMenu() {
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

  const logout = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  const item = (href: string, label: string) => (
    <Link
      href={href}
      onClick={() => setOpen(false)}
      role="menuitem"
      className="block rounded-xl px-3 py-2 text-sm hover:bg-surface"
    >
      {label}
    </Link>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню пользователя"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-background"
      >
        <IconUser size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-11 z-50 w-52 rounded-2xl bg-background p-2 shadow-overlay ring-1 ring-border-soft "
        >
          <div className="border-b border-border-soft px-3 py-2">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          {item(`/profile/${user.id}`, "Мой профиль")}
          {item("/messages", "Сообщения")}
          {item("/notifications", "Уведомления")}
          {item("/media", "Медиатека")}
          {item("/boards", "Мои доски")}
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
