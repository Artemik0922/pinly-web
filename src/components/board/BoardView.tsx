"use client";

// Одна доска: masonry сохранённых пинов. Своя — с переименованием,
// удалением и переключателем секретности; чужая — read-only через
// /api/boards/{id}/public (секретные бэкенд не отдаёт никому, кроме
// владельца, поэтому они выглядят как несуществующие).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sourceLabel, type Pin } from "@/lib/pin";
import { useBoards } from "@/lib/state/boards";
import { useUser } from "@/lib/state/session";
import { apiBoardPublic, type PublicBoard } from "@/lib/api/boards";
import { pinCountLabel, boardPinCount } from "@/lib/plural";
import { copyToClipboard, nativeShare } from "@/lib/share";
import { IconCompass, IconInbox, IconLock, IconPencil, IconShare } from "@/components/ui/Icons";
import { ConfirmDialog } from "@/components/ui/Confirm";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { BoardStats } from "@/components/board/BoardStats";
import { BoardContact } from "@/components/board/BoardContact";
import { ReportButton } from "@/components/report/ReportButton";
import { useToast } from "@/components/ui/Toast";
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

// Доска мастера собирается из чужих картинок по CC — кредит должен быть виден
// там, где их показывают заказчику, а не только на странице отдельного пина.
function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function Sources({ pins }: { pins: Pin[] }) {
  const seen = new Map<string, Pin>();
  for (const pin of pins) {
    const key = `${pin.author}|${pin.pageUrl ?? ""}`;
    if ((pin.author || pin.pageUrl) && !seen.has(key)) seen.set(key, pin);
  }
  const list = [...seen.values()].slice(0, 12);
  if (list.length === 0) return null;

  return (
    <details className="mt-6 text-xs text-muted">
      <summary className="cursor-pointer font-semibold">Источники · {list.length}</summary>
      <ul className="mt-2 space-y-1">
        {list.map((pin) => {
          const host = hostOf(pin.pageUrl);
          return (
            <li key={pin.id} className="truncate">
              {pin.author || "автор не указан"}
              {sourceLabel(pin) ? ` — ${sourceLabel(pin)}` : ""}
              {host && (
                <a
                  href={pin.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline underline-offset-2"
                >
                  {host}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function BoardView({
  id,
  initialForeign,
}: {
  id: string;
  /** Публичный срез, приехавший с сервера: без него краулер и мессенджер
   *  видели «Загрузка…», а гость допрашивал бэкенд повторно. */
  initialForeign?: PublicBoard | null;
}) {
  const { boards, ready, deleteBoard, renameBoard, toggleSecret } = useBoards();
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const board = boards.find((b) => b.id === id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shared, setShared] = useState(false);
  const [title, setTitle] = useState("");
  // Чужая доска: серверная порция либо ответ /api/boards/{id}/public.
  // Храним вместе с id — при переходе между досками ответ предыдущей
  // показан быть не может.
  const [loaded, setLoaded] = useState<{ id: string; board: PublicBoard | null } | null>(
    initialForeign ? { id, board: initialForeign } : null,
  );
  const foreign = loaded?.id === id ? loaded.board : null;
  const probed = loaded?.id === id;

  // «мастер приводит людей» проверяется здесь: сколько раз доску открыли
  // вне самого мастера и пришли ли по явной метке ?from=…
  useEffect(() => {
    track.boardView(id);
  }, [id]);

  useEffect(() => {
    if (!ready || board || loaded?.id === id) return;
    const controller = new AbortController();
    let cancelled = false;
    apiBoardPublic(id, controller.signal)
      .then((data) => {
        if (!cancelled) setLoaded({ id, board: data });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id, board: null });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, board, id, loaded]);

  if (board) {
    // Список досок приходит из локального кэша провайдера и может отстать от
    // сервера (сохранили пин в другой вкладке). Публичный срез, приехавший с
    // страницы, всегда свежий — берём пины из него, пока свой список не
    // переехал. Иначе «1 пин» в шапке и пустая сетка под ней.
    const pins: Pin[] = board.pins.length > 0 ? board.pins : (foreign?.pins ?? []);

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
      if (nativeShare({ title: board.title, text: "Мои работы", url: withMark("share") })) {
        setShared(true);
        return;
      }
      if (copyToClipboard(withMark("link"))) {
        setShared(true);
        toast.show("Ссылка на доску скопирована");
      } else {
        toast.show("Браузер не дал скопировать ссылку");
      }
    };

    return (
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6">
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {/* «Поделиться» — главное действие мастера, оно первым: остальное
                он трогает редко, а ссылку отправляет каждый раз */}
            <button
              type="button"
              onClick={shareBoard}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
            >
              <IconShare size={14} />
              Поделиться
            </button>
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
              onClick={() => setConfirmDelete(true)}
              className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-hover"
            >
              Удалить доску
            </button>
          </div>
          {/* Тост живёт пару секунд, а объяснение «что делать со ссылкой»
              нужно именно сейчас */}
          {shared && (
            <p className="mt-2 text-sm text-muted">
              Отправьте этот адрес заказчику — он увидит работы без регистрации.
            </p>
          )}
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
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6">
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
            <Sources pins={foreign.pins} />
          </div>
        )}

        {/* Единственный шаг, который остаётся заказчику: написать мастеру. */}
        <BoardContact owner={foreign.owner} />

        <div className="mt-3 flex justify-end">
          <ReportButton board={id} />
        </div>
      </div>
    );
  }

  // Доски нет ни среди своих, ни в публичном доступе.
  if (ready && probed) return <NotFound />;

  return <p className="py-20 text-center text-sm text-muted">Загрузка…</p>;
}
