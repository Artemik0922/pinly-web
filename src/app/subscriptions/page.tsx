"use client";

// Вкладка «Подписки»: пины и открытые доски авторов, на которых подписан.

import Link from "next/link";
import { SubscriptionsFeed } from "@/components/SubscriptionsFeed";
import { useUser } from "@/lib/user";

export default function SubscriptionsPage() {
  const { user, ready, enabled } = useUser();

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6">
      <h1 className="text-center text-2xl font-extrabold">Подписки</h1>
      {!ready ? (
        <p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>
      ) : !enabled || !user ? (
        <div className="py-20 text-center">
          <p className="text-muted">Войдите, чтобы следить за любимыми авторами.</p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Войти
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <SubscriptionsFeed />
        </div>
      )}
    </div>
  );
}
