"use client";

// Вкладка «Подписки»: свежие пины и открытые доски тех, на кого подписан.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Pin } from "@/data/pins";
import { apiSubscriptions, type PublicBoard } from "@/lib/account";
import { MasonryGrid } from "@/components/MasonryGrid";
import { PublicBoardCard } from "@/components/PublicBoardCard";
import { IconUserPlus } from "@/components/Icons";

export function SubscriptionsFeed() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [boards, setBoards] = useState<PublicBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    apiSubscriptions(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setPins(data.pins);
        setBoards(data.boards);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (loading) return null;

  if (failed || (pins.length === 0 && boards.length === 0)) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconUserPlus size={40} />
        </p>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Здесь появятся пины и доски авторов, на которых вы подписаны. Подписка — на странице
          автора: откройте её по клику на имя под пином.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          Найти авторов в ленте
        </Link>
      </div>
    );
  }

  return (
    <div className="py-2">
      {boards.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold">Доски подписок</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {boards.map((board) => (
              <PublicBoardCard key={board.id} board={board} />
            ))}
          </ul>
        </section>
      )}

      {pins.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">Новые пины</h2>
          <MasonryGrid pins={pins} />
        </section>
      )}
    </div>
  );
}
