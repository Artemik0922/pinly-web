"use client";

// Одна доска: masonry сохранённых пинов. Своя — с переименованием,
// удалением и переключателем секретности; чужая — read-only через
// /api/boards/{id}/public (секретные бэкенд не отдаёт никому, кроме
// владельца, поэтому они выглядят как несуществующие).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Pin } from "@/data/pins";
import { useBoards } from "@/lib/store";
import { useUser } from "@/lib/user";
import { apiBoardPublic, type PublicBoard } from "@/lib/account";
import { pinCountLabel, boardPinCount } from "@/lib/plural";
import { IconCompass, IconInbox, IconLock, IconPencil, IconShare } from "@/components/Icons";
import { ConfirmDialog } from "@/components/Confirm";
import { MasonryGrid } from "@/components/MasonryGrid";
import { BoardStats } from "@/components/BoardStats";
import { useToast } from "@/components/Toast";
import { track } from "@/lib/track";

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="grid place-items-center text-muted">
        <IconCompass size={40} />
      </p>
      <p className="mt-3 text-muted">Такой доски нет.</p>
      <Link
        href="/boards"
        className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
      >
        К списку досок
      </Link>
    </div>
  );
}

export function BoardView({ id }: { id: string }) {
  const { boards, ready, deleteBoard, renameBoard, toggleSecret } = useBoards();
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const board = boards.find((b) => b.id === id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState("");
  // Чужая доска: серверный ответ подтягиваем на клиенте, своего контекста
  // досок для неё нет.
  const [foreign, setForeign] = useState<PublicBoard | null>(null);
  const [probed, setProbed] = useState(false);

  // «мастер приводит людей» проверяется здесь: сколько раз доску открыли
  // вне самого мастера и пришли ли по явной метке ?from=…
  useEffect(() => {
    track.boardView(id);
  }, [id]);

  useEffect(() => {
    if (!ready || board) return;
    const controller = new AbortController();
    let cancelled = false;
    // переход между досками не должен оставить ответ предыдущей
    apiBoardPublic(id, controller.signal)
      .then(setForeign)
      .catch(() => {
        if (!cancelled) setForeign(null);
      })
      .finally(() => {
        if (!cancelled) setProbed(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, board, id]);

  if (board) {
    const pins: Pin[] = board.pins;

    const saveTitle = () => {
      const clean = title.trim();
      if (clean && clean !== board.title) renameBoard(board.id, clean);
      setEditing(false);
    };

    // Ссылка на доску — главное действие для мастера: показать работы
    // клиенту одним сообщением. Секретную доску отправить нельзя, поэтому
    // кнопка честно говорит, что включить, вместо тихого копирования
    // мёртвой ссылки.
    //
    // Пометка ?from= нужна, чтобы различить каналы: в мессенджерах Referer
    // теряется чаще, чем доживает, и без метки весь чужой трафик выглядит
    // как «напрямую».
    const withMark = (mark: string) => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("from")) url.searchParams.set("from", mark);
      return url.toString();
    };

    const shareBoard = async () => {
      if (board.isSecret) {
        toast.show("Доска скрыта — чтобы отправить ссылку, выключите «Скрытая от всех»");
        return;
      }
      track.shareCopy(board.id);
      if (navigator.share) {
        navigator
          .share({ title: board.title, text: "Мои работы", url: withMark("share") })
          .catch(() => undefined);
        return;
      }
      try {
        await navigator.clipboard.writeText(withMark("link"));
        toast.show("Ссылка на доску скопирована");
      } catch {
        toast.show("Браузер не дал скопировать ссылку");
      }
    };

    return (
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6">
        <div className="text-center">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveTitle();
              }}
              className="mx-auto flex max-w-md items-center gap-2"
            >
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="w-full rounded-full bg-surface px-4 py-2 text-center text-xl font-extrabold outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
              >
                ОК
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-3xl font-extrabold">{board.title}</h1>
              <button
                type="button"
                aria-label="Переименовать доску"
                onClick={() => {
                  setTitle(board.title);
                  setEditing(true);
                }}
                className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover sm:h-8 sm:w-8"
              >
                <IconPencil size={15} />
              </button>
            </div>
          )}
          <p className="mt-1 text-sm text-muted">{pinCountLabel(boardPinCount(board))}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            {user && (
              <button
                type="button"
                onClick={() => toggleSecret(board.id)}
                aria-pressed={!!board.isSecret}
                className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-hover ${
                  board.isSecret ? "bg-surface text-foreground" : "text-muted"
                }`}
              >
                <IconLock size={14} />
                {board.isSecret ? "Скрытая от всех" : "Видна всем"}
              </button>
            )}
            <button
              type="button"
              onClick={shareBoard}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
            >
              <IconShare size={14} />
              Поделиться
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-11 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-hover"
            >
              Удалить доску
            </button>
          </div>
        </div>

        {/* сводка видна только владельцу доски: в этой ветке board есть всегда,
            а чужая доска рисуется ниже, без цифр. В анонимном режиме (без
            бэкенда) просить нечего — счётчиков события не существуют */}
        {user && <BoardStats boardId={board.id} />}

        <ConfirmDialog
          open={confirmDelete}
          title={`Удалить доску «${board.title}»?`}
          body="Пины останутся в ленте — исчезнут только сохранения этой доски."
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            deleteBoard(board.id);
            router.push("/boards");
          }}
        />

        {pins.length === 0 && (
          <div className="py-16 text-center">
            <p className="grid place-items-center text-muted">
              <IconInbox size={40} />
            </p>
            <p className="mt-3 text-muted">Доска пуста — сохраните пины из ленты.</p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
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

  if (foreign) {
    return (
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold">{foreign.title}</h1>
          <p className="mt-1 text-sm text-muted">{pinCountLabel(boardPinCount(foreign))}</p>
          {foreign.owner && (
            <Link
              href={`/profile/${foreign.owner.id}`}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-card"
            >
              Доска {foreign.owner.name}
            </Link>
          )}
        </div>

        {foreign.pins.length === 0 && (
          <div className="py-16 text-center">
            <p className="grid place-items-center text-muted">
              <IconInbox size={40} />
            </p>
            <p className="mt-3 text-muted">В доске пока нет пинов.</p>
          </div>
        )}

        {foreign.pins.length > 0 && (
          <div className="mt-6">
            <MasonryGrid pins={foreign.pins} />
          </div>
        )}
      </div>
    );
  }

  // Доски нет ни среди своих, ни в публичном доступе.
  if (ready && probed) return <NotFound />;

  return <p className="py-20 text-center text-sm text-muted">Загрузка…</p>;
}
