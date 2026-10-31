"use client";

// Экран «раздел только для вошедших»: заголовок раздела, пояснение и вход.
// Один компонент, потому что messages, notifications и открытый чат показывали
// дословно одну и ту же разметку в трёх копиях.

import Link from "next/link";

export function SignInGate({ title, hint }: { title: string; hint: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{hint}</p>
      <Link
        href="/login"
        className="mt-4 inline-block rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
      >
        Войти
      </Link>
    </main>
  );
}
