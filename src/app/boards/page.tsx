"use client";

// Список досок пользователя + создание новой.

import Link from "next/link";
import { useState } from "react";
import { pinImageUrl, type Pin } from "@/data/pins";
import { useBoards } from "@/lib/store";
import { pinCountLabel } from "@/lib/plural";
import { IconFolder, IconPin } from "@/components/Icons";

function BoardThumb({ pin }: { pin: Pin }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pinImageUrl(pin)}
      alt=""
      className="aspect-square w-1/3 object-cover"
    />
  );
}

function BoardCard({ id }: { id: string }) {
  const { boards, deleteBoard } = useBoards();
  const board = boards.find((b) => b.id === id);
  if (!board) return null;
  const preview = board.pins.slice(0, 3);

  return (
    <div className="group relative">
      <Link href={`/board/${board.id}`} className="block">
        <div className="flex aspect-[3/2] w-full overflow-hidden rounded-2xl bg-surface">
          {preview.length === 0 ? (
            <div className="grid w-full place-items-center text-muted">
              <IconPin size={36} />
            </div>
          ) : (
            <div className="flex w-full">
              {preview.map((pin) => (
                <BoardThumb key={pin.id} pin={pin} />
              ))}
              {preview.length < 3 &&
                Array.from({ length: 3 - preview.length }).map((_, i) => (
                  <div key={i} className="aspect-square w-1/3 bg-surface" />
                ))}
            </div>
          )}
        </div>
        <p className="mt-2 font-semibold">{board.title}</p>
        <p className="text-sm text-muted/80">{pinCountLabel(board.pins.length)}</p>
      </Link>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Удалить доску «${board.title}»?`)) deleteBoard(board.id);
        }}
        className="absolute right-2 top-2 hidden rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow hover:bg-background group-hover:block"
      >
        Удалить
      </button>
    </div>
  );
}

export default function BoardsPage() {
  const { boards, createBoard, ready } = useBoards();
  const [title, setTitle] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    createBoard(title);
    setTitle("");
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Ваши доски</h1>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Название новой доски…"
            className="w-56 rounded-full bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            Создать
          </button>
        </div>
      </div>

      {!ready && <p className="py-10 text-center text-sm text-muted/80">Загрузка…</p>}

      {ready && boards.length === 0 && (
        <div className="py-16 text-center">
          <p className="grid place-items-center text-muted">
            <IconFolder size={40} />
          </p>
          <p className="mt-3 text-muted">
            Досок пока нет. Создайте первую или сохраните пин из ленты.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            В ленту
          </Link>
        </div>
      )}

      {ready && boards.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {boards.map((board) => (
            <BoardCard key={board.id} id={board.id} />
          ))}
        </div>
      )}
    </div>
  );
}
