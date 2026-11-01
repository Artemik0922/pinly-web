// Данные для <title>/og: серверные generateMetadata не могут ходить в
// клиентский REST-слой (он работает с относительными путями), поэтому
// обращаемся к бэкенду напрямую. Не ответил за секунду — берём общий title.

import { cache } from "react";
import { pinImageUrl, type Pin } from "@/lib/pin";
import { backendJson } from "@/lib/server/backend";
import type { PageMeta } from "@/lib/server/seo";
import type { PublicBoard } from "@/lib/api/boards";
import type { ProfileData, PublicUser } from "@/lib/api/social";

const META_TIMEOUT_MS = 1500;

// Первая порция пинов на витрине. Остальное гость добирает кнопкой: страница
// мастера с сотней загрузок не должна приезжать сотней карточек в HTML.
const PROFILE_PINS = 24;

/**
 * Публичный срез доски — один запрос на рендер. Нужен и метаданным
 * (og:image берётся из первого пина), и самой странице: без него поисковик
 * и мессенджер получали «Загрузка…» вместо работ мастера.
 *
 * Секретную доску бэкенд не отдаёт никому (404), поэтому здесь её просто
 * нет — приватный взгляд владельца собирается на клиенте из своего списка
 * досок, и «чинить» это серверным рендером нельзя.
 */
export const boardCard = cache(async (id: string): Promise<PublicBoard | null> => {
  const data = await backendJson<{ board: PublicBoard }>(
    `/api/boards/${encodeURIComponent(id)}/public`,
    { timeoutMs: META_TIMEOUT_MS },
  );
  return data?.board ?? null;
});

export async function boardMeta(id: string): Promise<PageMeta | null> {
  const board = await boardCard(id);
  if (!board) return null;
  const first = board.pins?.[0];
  return {
    title: board.title,
    description: board.owner ? `Доска ${board.owner.name} в Pinly` : "Доска в Pinly",
    path: `/board/${id}`,
    imageUrl: first ? pinImageUrl(first) : undefined,
  };
}

/**
 * Публичная витрина мастера — одним запросом на рендер. Профиль раньше
 * собирался целиком на клиенте, и краулер (которому адрес уже отдан в
 * sitemap) видел «Загрузка…» вместо досок, а гость платил двойным обращением
 * к бэкенду.
 *
 * Сессия передаётся только ради `isSelf`: по нему страница решает, показывать
 * приватный взгляд владельца или публичную витрину. Больше ничего cookie не
 * меняет — секретные доски бэкенд не отдаёт и этому слою.
 */
export const profileData = cache(
  async (id: string, session: string | null): Promise<ProfileData | null> => {
    const path = `/api/users/${encodeURIComponent(id)}`;
    const [user, boards, pins] = await Promise.all([
      backendJson<{ user: PublicUser }>(path, { timeoutMs: META_TIMEOUT_MS, session }),
      backendJson<{ boards: PublicBoard[] }>(`${path}/boards`, { timeoutMs: META_TIMEOUT_MS }),
      backendJson<{ pins: Pin[] }>(`${path}/pins?limit=${PROFILE_PINS}`, {
        timeoutMs: META_TIMEOUT_MS,
      }),
    ]);
    if (!user) return null;
    // Доски и пины — ухудшение, а не отказ: карточка есть, остальное догрузит
    // клиент. Пустой список честнее отменённой страницы.
    return { profile: user.user, boards: boards?.boards ?? [], pins: pins?.pins ?? [] };
  },
);

export async function profileMeta(id: string, session: string | null): Promise<PageMeta | null> {
  const data = await profileData(id, session);
  if (!data) return null;
  // Превью для ссылки в чате: без og:image профиль мастера — серая полоска
  // текста. Бер первую работу, а если их нет — аватар.
  const first = data.pins[0];
  return {
    title: data.profile.displayName,
    description: `${data.profile.pinsCount} пинов и открытые доски автора в Pinly`,
    path: `/profile/${id}`,
    imageUrl: first ? pinImageUrl(first) : data.profile.avatarUrl ?? undefined,
  };
}

