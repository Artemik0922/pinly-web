"use client";

// Публичная страница другого пользователя (и своя же, но открытая по ссылке):
// пины, открытые доски (секретные бэкенд не отдаёт) и подписка с чатом.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Pin } from "@/lib/pin";
import { apiStartChat } from "@/lib/api/chats";
import type { PublicBoard } from "@/lib/api/boards";
import {
  apiFollow,
  apiPublicUser,
  apiUnfollow,
  apiUserBoards,
  apiUserPins,
  type ProfileData,
} from "@/lib/api/social";
import { useUser } from "@/lib/state/session";
import { countLabel } from "@/lib/plural";
import { Avatar } from "@/components/ui/Avatar";
import { IconCompass, IconMessage, IconUserCheck, IconUserPlus } from "@/components/ui/Icons";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { PublicBoardCard } from "@/components/board/PublicBoardCard";
import { useToast } from "@/components/ui/Toast";

export function PublicProfile({
  id,
  initial = null,
}: {
  id: string;
  /** Витрина, приехавшая с сервера. Без неё краулер и мессенджер видели
   *  «Загрузка…» вместо работ мастера, а гость спрашивал бэкенд заново. */
  initial?: ProfileData | null;
}) {
  const { user } = useUser();
  const { show } = useToast();
  const router = useRouter();
  // Серверная порция хранится вместе с id: при переходе между профилями
  // данные предыдущего автора показаны быть не могут.
  const [page, setPage] = useState<{ id: string; data: ProfileData | null } | null>(
    initial ? { id, data: initial } : null,
  );
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [widening, setWidening] = useState(false);

  const data = page?.id === id ? page.data : null;
  const loaded = page?.id === id;

  const replace = (next: ProfileData | null) => setPage({ id, data: next });

  // Сервер уже принёс витрину — повторный запрос на монтировании только
  // перерисовал бы masonry. Если порции нет (бэкенд молчал), разбирается
  // клиент, как до серверного рендера.
  useEffect(() => {
    if (page?.id === id) return;
    const controller = new AbortController();
    let cancelled = false;
    Promise.all([
      apiPublicUser(id, controller.signal),
      apiUserPins(id, controller.signal).catch(() => [] as Pin[]),
      apiUserBoards(id, controller.signal).catch(() => [] as PublicBoard[]),
    ])
      .then(([profile, pins, boards]) => {
        if (cancelled) return;
        setPage({ id, data: profile ? { profile, pins, boards } : null });
      })
      .catch(() => {
        if (!cancelled) setPage({ id, data: null }); // бэкенд недоступен — профиль закрыт
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, page]);

  const toggleFollow = async () => {
    if (!data) return;
    setBusy(true);
    const wasFollowing = data.profile.isFollowing;
    try {
      if (wasFollowing) await apiUnfollow(data.profile.id);
      else await apiFollow(data.profile.id);
      const updated = await apiPublicUser(data.profile.id);
      if (updated) replace({ ...data, profile: updated });
    } catch {
      show(wasFollowing ? "Отписаться не вышло." : "Подписка не оформилась — попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  // Сервер приносит первую порцию пинов, остальное догружается по просьбе:
  // иначе страница мастера с сотней загрузок приезжает в HTML сотней
  // карточек. Счётчик в шапке при этом всегда полный — показываем, что
  // скрыто, а не делаем вид, что пинов нет.
  const showAllPins = async () => {
    if (!data || widening) return;
    setWidening(true);
    try {
      replace({ ...data, pins: await apiUserPins(data.profile.id) });
    } catch {
      show("Не удалось догрузить пины — попробуйте ещё раз.");
    } finally {
      setWidening(false);
    }
  };

  const startChat = async () => {
    if (messaging || !data) return;
    setMessaging(true);
    try {
      const chat = await apiStartChat(data.profile.id);
      router.push(`/messages/${chat.id}`);
    } catch {
      show("Не удалось открыть чат — попробуйте ещё раз.");
      setMessaging(false);
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
    <div className="mx-auto w-full max-w-shell px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} url={profile.avatarUrl} size={72} textSize="text-lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            {countLabel(profile.pinsCount, "пин", "пина", "пинов")} ·{" "}
            {countLabel(profile.boardsCount, "открытая доска", "открытые доски", "открытых досок")}{" "}
            · {countLabel(profile.followers, "подписчик", "подписчика", "подписчиков")}
          </p>
        </div>
        {!profile.isSelf &&
          (user ? (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={startChat}
                disabled={messaging}
                className="flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50"
              >
                <IconMessage size={16} />
                Написать
              </button>
              <button
                type="button"
                onClick={toggleFollow}
                disabled={busy}
                aria-pressed={profile.isFollowing}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                  profile.isFollowing
                    ? "bg-surface text-foreground hover:bg-surface-card"
                    : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {profile.isFollowing ? <IconUserCheck size={16} /> : <IconUserPlus size={16} />}
                {profile.isFollowing ? "Вы подписаны" : "Подписаться"}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="ml-auto rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
            >
              Войти, чтобы подписаться
            </Link>
          ))}
      </div>

      {(pins.length > 0 || profile.pinsCount > 0) && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">Пины пользователя</h2>
          {pins.length > 0 ? (
            <MasonryGrid pins={pins} />
          ) : (
            <p className="text-muted">Первую порцию пинов получить не удалось.</p>
          )}
          {pins.length < profile.pinsCount && (
            <button
              type="button"
              onClick={showAllPins}
              disabled={widening}
              className="mt-4 w-full rounded-2xl bg-surface px-4 py-3 text-sm font-semibold hover:bg-surface-card disabled:opacity-50"
            >
              {widening
                ? "Догружаю…"
                : `Показать ещё ${countLabel(profile.pinsCount - pins.length, "пин", "пина", "пинов")}`}
            </button>
          )}
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
