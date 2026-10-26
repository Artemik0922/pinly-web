"use client";

// Одна доска: masonry сохранённых пинов. id приходит пропсом
// с серверной страницы — хуки URL не нужны.

import Link from "next/link";
import type { Pin } from "@/data/pins";
import { useBoards } from "@/lib/store";
import { pinCountLabel } from "@/lib/plural";
import { IconCompass, IconInbox } from "@/components/Icons";
import { MasonryGrid } from "@/components/MasonryGrid";

export function BoardView({ id }: { id: string }) {
  const { boards, ready, deleteBoard } = useBoards();
  const board = boards.find((b) => b.id === id);

  if (ready && !board) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconCompass size={40} />
        </p>
        <p className="mt-3 text-muted">Такой доски нет.</p>
        <Link
          href="/boards"
          className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          К списку досок
        </Link>
      </div>
    );
  }

  const pins: Pin[] = board?.pins ?? [];

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">{board?.title ?? "…"}</h1>
        <p className="mt-1 text-sm text-muted/80">{pinCountLabel(pins.length)}</p>
        {board && pins.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Удалить доску «${board.title}»?`)) {
                deleteBoard(board.id);
                window.location.href = "/boards";
              }
            }}
            className="mt-3 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface"
          >
            Удалить доску
          </button>
        )}
      </div>

      {ready && pins.length === 0 && (
        <div className="py-16 text-center">
          <p className="grid place-items-center text-muted">
            <IconInbox size={40} />
          </p>
          <p className="mt-3 text-muted">Доска пуста — сохраните пины из ленты.</p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            В ленту
          </Link>
        </div>
      )}

      {pins.length > 0 && (
        <div className="mt-6">
          <MasonryGrid pins={pins} />
        </div>
      )}
    </div>
  );
}
