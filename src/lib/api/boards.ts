// Доски: свои (backend/accounts.py) и публичный срез чужой доски.

import type { Pin } from "@/lib/pin";
import { isStatus, requestJson } from "@/lib/api/http";

export type Board = {
  id: string;
  title: string;
  createdAt: number;
  isSecret?: boolean;
  // Полное число пинов: список досок отдаёт pins срезом (экономия payload)
  pinsCount?: number;
  pins: Pin[];
};

// Публичная доска: наружу всегда отдаётся владелец, а секрет помечен явно.
export type PublicBoard = Board & {
  isSecret: boolean;
  owner?: { id: string; name: string };
};

export async function apiBoards(): Promise<Board[]> {
  const data = await requestJson<{ boards: Board[] }>("/api/boards");
  return data.boards;
}

export async function apiCreateBoard(
  title: string,
  opts: { isSecret?: boolean; ifMissing?: boolean } = {},
): Promise<Board> {
  const data = await requestJson<{ board: Board }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({
      title,
      is_secret: opts.isSecret ?? false,
      // «создать, если ещё нет» — стартовые доски заводятся один раз,
      // иначе двойное монтирование плодит копии с одинаковым названием
      if_missing: opts.ifMissing ?? false,
    }),
  });
  return data.board;
}

export async function apiRenameBoard(boardId: string, title: string): Promise<void> {
  await requestJson(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function apiDeleteBoard(boardId: string): Promise<void> {
  await requestJson(`/api/boards/${boardId}`, { method: "DELETE" });
}

export async function apiSavePin(boardId: string, pin: Pin): Promise<void> {
  await requestJson(`/api/boards/${boardId}/pins/${encodeURIComponent(pin.id)}`, {
    method: "PUT",
    body: JSON.stringify(pin),
  });
}

export async function apiUnsavePin(boardId: string, pinId: string): Promise<void> {
  await requestJson(`/api/boards/${boardId}/pins/${encodeURIComponent(pinId)}`, {
    method: "DELETE",
  });
}

// PUT без тела: сервер сам инвертирует флаг и возвращает итоговое значение.
export async function apiToggleSecret(boardId: string): Promise<boolean> {
  const data = await requestJson<{ isSecret: boolean }>(`/api/boards/${boardId}/secret`, {
    method: "PUT",
    body: "{}",
  });
  return data.isSecret;
}

/** Публичная доска по id; нет или закрыта — null (404 здесь значит «нет»). */
export async function apiBoardPublic(
  boardId: string,
  signal?: AbortSignal,
): Promise<PublicBoard | null> {
  try {
    const data = await requestJson<{ board: PublicBoard }>(
      `/api/boards/${encodeURIComponent(boardId)}/public`,
      { signal },
    );
    return data.board;
  } catch (err) {
    if (isStatus(err, 404)) return null;
    throw err;
  }
}
