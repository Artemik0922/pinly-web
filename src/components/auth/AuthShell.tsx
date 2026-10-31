"use client";

// Общий каркас форм входа/регистрации: та же колонка, тот же заголовок, та же
// кнопка и то же сообщение об ошибке. Разнятся только поля и тексты ошибок —
// они остаются на странице.

import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  children,
  question,
  href,
  linkLabel,
}: {
  title: string;
  children: ReactNode;
  question: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">{title}</h1>
      {children}
      <p className="mt-8 text-center text-sm text-muted">
        {question}{" "}
        <Link href={href} className="font-semibold text-accent-strong hover:underline">
          {linkLabel}
        </Link>
      </p>
    </div>
  );
}

export function AuthSubmit({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition-transform duration-150 ease-pop hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}
