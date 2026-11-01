"use client";

// Витрина мастера отвечает на единственный вопрос посетителя: «как с ним
// связаться». До этого на чужой доске были работы, кредиты источникам и
// «Пожаловаться», но ни одного действия для человека, которому работы
// понравились, — то есть ссылка, приведшая заказчика, упиралась в тупик.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiStartChat } from "@/lib/api/chats";
import { useUser } from "@/lib/state/session";
import { IconMessage } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";

export function BoardContact({
  owner,
}: {
  owner?: { id: string; name: string } | null;
}) {
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Без автора витрина остаётся сеткой картинок — предлагать нечего.
  if (!owner) return null;

  const write = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const chat = await apiStartChat(owner.id);
      router.push(`/messages/${chat.id}`);
    } catch {
      toast.show("Сообщение не открылось — попробуйте ещё раз.");
      setBusy(false);
    }
  };

  const primary =
    "flex min-h-11 items-center gap-2 rounded-full bg-accent-fill px-5 py-2.5 text-sm font-semibold text-accent-on hover:brightness-110 disabled:opacity-60";

  return (
    <section className="mt-8 rounded-2xl bg-surface-card px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{owner.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            {user
              ? "Напишите — обсудите проект прямо в Pinly"
              : "Чтобы написать мастеру, войдите: регистрация занимает минуту"}
          </p>
        </div>

        {user ? (
          <>
            <button type="button" onClick={write} disabled={busy} className={primary}>
              <IconMessage size={16} />
              {busy ? "Открываю…" : "Написать мастеру"}
            </button>
            <Link
              href={`/profile/${owner.id}`}
              className="flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-hover"
            >
              Все доски мастера
            </Link>
          </>
        ) : (
          <Link href={`/profile/${owner.id}`} className={primary}>
            Профиль и доски мастера
          </Link>
        )}
      </div>
    </section>
  );
}
