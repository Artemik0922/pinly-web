"use client";

// Список досок пользователя + создание новой.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { type Pin } from "@/lib/pin";
import { PinImage } from "@/components/feed/PinCard";
import { ConfirmDialog } from "@/components/ui/Confirm";
import { useBoards } from "@/lib/state/boards";
import { useUser } from "@/lib/state/session";
import { track } from "@/lib/track";
import { pinCountLabel, boardPinCount } from "@/lib/plural";
import { IconFolder, IconLock, IconPin } from "@/components/ui/Icons";

function BoardThumb({ pin }: { pin: Pin }) {
  return (
    <PinImage
      pin={pin}
      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 28vw, 18vw"
      className="aspect-square w-1/3 rounded-none object-cover"
    />
  );
}

function BoardCard({ id }: { id: string }) {
  const { boards, deleteBoard } = useBoards();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
        <p className="mt-2 flex items-center gap-2 font-semibold">
          {board.title}
          {board.isSecret && (
            <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
              <IconLock size={11} />
              Секретная
            </span>
          )}
        </p>
        <p className="text-sm text-muted">{pinCountLabel(boardPinCount(board))}</p>
      </Link>
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="absolute right-2 top-2 hidden rounded-full bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow hover:bg-background group-hover:block group-focus-within:block"
      >
        Удалить
      </button>
      <ConfirmDialog
        open={confirmDelete}
        title={`Удалить доску «${board.title}»?`}
        body="Пины останутся в ленте — исчезнут только сохранения этой доски."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteBoard(board.id);
        }}
      />
    </div>
  );
}

// Появляется только по ?welcome=1 — то есть сразу после регистрации, где
// человек ещё не знает, что у него уже есть доски и что с ними делать.
// Не оверлей: он не должен мешать ни клику по доске, ни тестам.
function WelcomeNote({ count }: { count: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || params.get("welcome") !== "1") return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Это ваши доски — {count}.</span> Откройте ту,
        которую покажете заказчику, назовите её своими словами и нажмите «Поделиться»:
        ссылку увидят без регистрации.
      </p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          router.replace("/boards");
        }}
        className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
      >
        Понятно
      </button>
    </div>
  );
}

export default function BoardsPage() {
  const { boards, createBoard, ready } = useBoards();
  const { user, enabled } = useUser();
  const [title, setTitle] = useState("");
  const [secret, setSecret] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    try {
      track.boardCreated((await createBoard(title, secret)).id);
    } catch {
      // store уже показал тост «Доска не создалась»
    }
    setTitle("");
    setSecret(false);
  };

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Ваши доски</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Название новой доски…"
            className="w-56 rounded-full bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          {enabled && user && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={secret}
                onChange={(e) => setSecret(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Секретная
            </label>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim()}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
          >
            Создать
          </button>
        </div>
      </div>

      {!ready && <p className="py-10 text-center text-sm text-muted">Загрузка…</p>}

      {/* useSearchParams статической страницы требует Suspense-границы */}
      <Suspense fallback={null}>
        <WelcomeNote count={boards.length} />
      </Suspense>

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
            className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
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
