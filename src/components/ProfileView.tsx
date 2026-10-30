"use client";

// Профиль: свой — с редактированием (имя, аватар), своими пинами и удалением
// аккаунта (152-ФЗ); чужой — публичная страница: пины, открытые доски
// (секретные бэкенд не отдаёт) и подписка.

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  apiDeleteAccount,
  apiFollow,
  apiPublicUser,
  apiUnfollow,
  apiUpdateDisplayName,
  apiUploadAvatar,
  apiUserBoards,
  apiUserPins,
  type PublicBoard,
  type PublicUser,
} from "@/lib/account";
import type { Pin } from "@/data/pins";
import { useUser } from "@/lib/user";
import { useBoards } from "@/lib/store";
import { pinCountLabel, countLabel, boardPinCount } from "@/lib/plural";
import { IconCompass, IconLock, IconUserCheck, IconUserPlus } from "@/components/Icons";
import { Avatar, initialsOf } from "@/components/Avatar";
import { ConfirmDialog } from "@/components/Confirm";
import { PublicBoardCard } from "@/components/PublicBoardCard";
import { useToast } from "@/components/Toast";
import { MasonryGrid } from "@/components/MasonryGrid";

type Profile = { display_name: string; avatar_url: string | null };

// Публичная страница другого пользователя (и своя же, но открытая по ссылке).
type PublicData = { profile: PublicUser; pins: Pin[]; boards: PublicBoard[] };

function PublicProfile({ id }: { id: string }) {
  const { user } = useUser();
  const { show } = useToast();
  const [data, setData] = useState<PublicData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    Promise.all([
      apiPublicUser(id, controller.signal),
      apiUserPins(id, controller.signal).catch(() => [] as Pin[]),
      apiUserBoards(id, controller.signal).catch(() => [] as PublicBoard[]),
    ])
      .then(([profile, pins, boards]) => {
        if (cancelled) return;
        setData(profile ? { profile, pins, boards } : null);
      })
      .catch(() => {
        if (!cancelled) setData(null); // бэкенд недоступен — профиль закрыт
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  const toggleFollow = async () => {
    if (!data) return;
    setBusy(true);
    const wasFollowing = data.profile.isFollowing;
    try {
      if (wasFollowing) await apiUnfollow(data.profile.id);
      else await apiFollow(data.profile.id);
      const updated = await apiPublicUser(data.profile.id);
      if (updated) setData({ ...data, profile: updated });
    } catch {
      show(wasFollowing ? "Отписаться не вышло." : "Подписка не оформилась — попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <p className="py-20 text-center text-sm text-muted">Загрузка…</p>;
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconCompass size={40} />
        </p>
        <p className="mt-3 text-muted">Профиль недоступен: такой пользователь не найден.</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          В ленту
        </Link>
      </div>
    );
  }

  const { profile, pins, boards } = data;

  const name = profile.displayName || "Пользователь";

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} url={profile.avatarUrl} size={72} textSize="text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            {countLabel(profile.pinsCount, "пин", "пина", "пинов")} ·{" "}
            {countLabel(profile.boardsCount, "открытая доска", "открытые доски", "открытых досок")}{" "}
            · {countLabel(profile.followers, "подписчик", "подписчика", "подписчиков")}
          </p>
        </div>
        {!profile.isSelf &&
          (user ? (
            <button
              type="button"
              onClick={toggleFollow}
              disabled={busy}
              aria-pressed={profile.isFollowing}
              className={`ml-auto flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                profile.isFollowing
                  ? "bg-surface text-foreground hover:bg-surface-card"
                  : "bg-foreground text-background hover:opacity-90"
              }`}
            >
              {profile.isFollowing ? <IconUserCheck size={16} /> : <IconUserPlus size={16} />}
              {profile.isFollowing ? "Вы подписаны" : "Подписаться"}
            </button>
          ) : (
            <Link
              href="/login"
              className="ml-auto rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
            >
              Войти, чтобы подписаться
            </Link>
          ))}
      </div>

      {pins.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">Пины пользователя</h2>
          <MasonryGrid pins={pins} />
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">Открытые доски</h2>
        {boards.length === 0 ? (
          <p className="text-muted">
            {pins.length === 0 ? "У пользователя пока ничего нет." : "Открытых досок нет."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {boards.map((board) => (
              <PublicBoardCard key={board.id} board={board} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ProfileView({ id }: { id: string }) {
  const { user, ready: userReady, enabled, refreshUser, signOut } = useUser();
  const { boards, ready: boardsReady } = useBoards();
  const router = useRouter();
  const isOwn = user?.id === id;
  const [ownPins, setOwnPins] = useState<Pin[]>([]);

  // редактирование
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Профиль свой — данные уже лежат в контексте сессии, отдельный запрос не нужен.
  const profile: Profile | null = isOwn
    ? {
        display_name: user?.user_metadata?.display_name ?? "",
        avatar_url: user?.user_metadata?.avatar_url ?? null,
      }
    : null;

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

  const nameShown = profile?.display_name || user?.email?.split("@")[0] || "Профиль";
  const avatarUrl = profile?.avatar_url ?? null;

  const pickAvatar = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) {
      setError("Аватар больше 3 МБ");
      return;
    }
    setError(null);
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const saveProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiUpdateDisplayName(name);
      if (avatarFile) await apiUploadAvatar(avatarFile);
      await refreshUser();
      setEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch {
      setError("Не удалось сохранить профиль.");
    } finally {
      setBusy(false);
    }
  };

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

  if (editing) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-center text-2xl font-extrabold">Редактирование профиля</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile();
          }}
          className="mt-8 space-y-4"
        >
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-foreground text-xl font-bold text-background"
              aria-label="Сменить аватар"
            >
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью
                <img src={avatarPreview} alt="Аватар" className="h-full w-full object-cover" />
              ) : avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Аватар"
                  width={80}
                  height={80}
                  sizes="80px"
                  className="h-full w-full object-cover"
                />
              ) : (
                initialsOf(nameShown)
              )}
            </button>
            <span className="text-xs text-muted">JPG, PNG или WebP, до 3 МБ</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0])}
            />
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            maxLength={60}
            className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-sm text-muted">{user?.email}</p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-full bg-accent-strong py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setAvatarFile(null);
                setAvatarPreview(null);
                setError(null);
              }}
              className="rounded-full px-5 py-3 text-sm font-semibold text-muted hover:bg-surface"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="flex items-center gap-4">
        <Avatar name={nameShown} url={avatarUrl} size={64} textSize="text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{nameShown}</h1>
          <p className="text-sm text-muted">{user?.email}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setName(profile?.display_name ?? "");
              setEditing(true);
            }}
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
                <p className="flex items-center gap-1.5 truncate font-semibold">
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
        body="Доски, пины, лайки, подписки и комментарии будут стёрты безвозвратно."
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
