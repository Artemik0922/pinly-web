"use client";

// Профиль: свой — со входом в редактор (имя, аватар), своими пинами и
// удалением аккаунта (152-ФЗ); чужой — публичная страница (PublicProfile).
// Здесь только разбор, чей профиль показан, и содержимое своего.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Pin } from "@/lib/pin";
import { apiDeleteAccount } from "@/lib/api/auth";
import { apiUserPins } from "@/lib/api/social";
import { useBoards } from "@/lib/state/boards";
import { useUser } from "@/lib/state/session";
import { boardPinCount, pinCountLabel } from "@/lib/plural";
import { IconCompass, IconLock } from "@/components/ui/Icons";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/Confirm";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { PublicProfile } from "@/components/profile/PublicProfile";

export function ProfileView({ id }: { id: string }) {
  const { user, ready: userReady, enabled, signOut } = useUser();
  const { boards, ready: boardsReady } = useBoards();
  const router = useRouter();
  const isOwn = user?.id === id;
  const [ownPins, setOwnPins] = useState<Pin[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Свои загрузки — на профиле тоже должны быть видны.
  useEffect(() => {
    if (!isOwn) return;
    const controller = new AbortController();
    let cancelled = false;
    apiUserPins(id, controller.signal)
      .then((pins) => {
        if (!cancelled) setOwnPins(pins);
      })
      .catch(() => {
        if (!cancelled) setOwnPins([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOwn, id]);

  // Чужой профиль грузится сам внутри PublicProfile.
  if (!userReady) {
    return <p className="py-20 text-center text-sm text-muted">Загрузка…</p>;
  }

  if (!enabled) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconCompass size={40} />
        </p>
        <p className="mt-3 text-muted">Профили появятся после подключения сервера авторизации.</p>
      </div>
    );
  }

  // Чужой профиль (и анонимный гость) — публичная страница.
  if (!isOwn) return <PublicProfile id={id} />;

  if (editing) return <ProfileEditor onDone={() => setEditing(false)} />;

  const removeAccount = async () => {
    setBusy(true);
    try {
      await apiDeleteAccount();
      await signOut();
      router.push("/");
      router.refresh();
    } catch {
      setBusy(false);
      setError("Не удалось удалить аккаунт.");
    }
  };

  const nameShown = user.displayName || "Профиль";

  return (
    <div className="mx-auto max-w-shell px-4 py-8">
      <div className="flex items-center gap-4">
        <Avatar name={nameShown} url={user.avatarUrl} size={64} textSize="text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{nameShown}</h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            Редактировать профиль
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="min-h-11 rounded-full px-3 text-xs text-muted hover:text-danger"
          >
            Удалить аккаунт
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <h2 className="mt-10 text-lg font-bold">Мои доски</h2>
      {!boardsReady && <p className="py-8 text-center text-sm text-muted">Загрузка…</p>}
      {boardsReady && boards.length === 0 && (
        <p className="py-8 text-muted">
          Досок пока нет.{" "}
          <Link href="/boards" className="text-accent-strong hover:underline">
            Создать первую
          </Link>
        </p>
      )}
      {boardsReady && boards.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/board/${board.id}`}
                className="block rounded-2xl bg-surface-card p-4 hover:bg-surface-hover"
              >
                <p className="flex items-center gap-2 truncate font-semibold">
                  {board.title}
                  {board.isSecret && <IconLock size={13} className="shrink-0 text-muted" />}
                </p>
                <p className="mt-1 text-sm text-muted">{pinCountLabel(boardPinCount(board))}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Мои пины</h2>
          <Link
            href="/pin/new"
            className="rounded-full bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-card"
          >
            Загрузить пин
          </Link>
        </div>
        {ownPins.length === 0 ? (
          <p className="mt-3 text-muted">Своих пинов пока нет — загрузите первую картинку.</p>
        ) : (
          <div className="mt-4">
            <MasonryGrid pins={ownPins} />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить аккаунт?"
        body="Доски, пины, лайки, подписки, комментарии и сообщения будут стёрты безвозвратно."
        confirmLabel="Удалить аккаунт"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          removeAccount();
        }}
      />
    </div>
  );
}
