// Хранилище досок: локальное (аноним) и серверное (вошедший) с однократной
// миграцией локальных досок в БД при первом входе. Провайдер стейта решает
// только «когда перечитать», а как данные достать — здесь.

import type { Board } from "@/lib/api/boards";
import { apiBoards, apiCreateBoard, apiSavePin } from "@/lib/api/boards";
import { readJson, readString, removeKey, writeJson, writeString } from "@/lib/storage";

const LS_KEY = "pinly:boards:v1";
const LS_MIGRATED = "pinly:boards:migrated";
// Размер пакета миграции: 8 — компромисс между latency одного запроса
// и очередью на запись в бэкенде.
const MIGRATE_BATCH = 8;

const DEFAULT_BOARD_TITLES = ["Идеи для дома", "Рецепты", "Вдохновение"];

export type LocalBoards = {
  boards: Board[];
  activeBoardId: string | null;
};

export function newBoardId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedBoards(): Board[] {
  return DEFAULT_BOARD_TITLES.map((title, i) => ({
    id: newBoardId() + i,
    title,
    createdAt: Date.now() + i,
    pins: [],
  }));
}

function normalize(raw: unknown): Board[] {
  if (!Array.isArray(raw)) return seedBoards();
  return (raw as Board[]).map((b) => ({
    ...b,
    pins: Array.isArray(b.pins) ? b.pins : [],
  }));
}

export function loadLocal(): LocalBoards {
  if (typeof window === "undefined") return { boards: [], activeBoardId: null };
  const stored = readJson<{ boards: Board[]; activeBoardId: string | null } | null>(LS_KEY, null);
  if (!stored) {
    const boards = seedBoards();
    return { boards, activeBoardId: boards[0]?.id ?? null };
  }
  const boards = normalize(stored.boards);
  const activeBoardId =
    stored.activeBoardId && boards.some((b) => b.id === stored.activeBoardId)
      ? stored.activeBoardId
      : (boards[0]?.id ?? null);
  return { boards, activeBoardId };
}

export function saveLocal(state: LocalBoards): void {
  writeJson(LS_KEY, state);
}

// Пустой список = «пользователь ещё ни разу не переносил доски»: маркер
// ставится по id, поэтому повторный вход тем же аккаунтом ничего не дублирует.
async function migrateLocalBoards(userId: string, boards: Board[]): Promise<void> {
  if (typeof window === "undefined" || readString(LS_MIGRATED) === userId) return;
  const pending = loadLocal().boards.filter((b) => b.pins.length > 0);
  for (const local of pending) {
    const created = await apiCreateBoard(local.title, { ifMissing: true });
    // Пакетами: по одному запросу на пин миграция из 300 сохранений
    // растягивалась на минуту, а все сразу упёрлись бы и в лимит соединений
    // браузера, и в последовательную запись SQLite.
    for (let i = 0; i < local.pins.length; i += MIGRATE_BATCH) {
      const batch = local.pins.slice(i, i + MIGRATE_BATCH);
      await Promise.all(batch.map((pin) => apiSavePin(created.id, pin)));
    }
    const imported = boards.find((b) => b.id === created.id);
    if (imported) imported.pins = local.pins;
    else boards.push({ ...created, pins: local.pins });
  }
  writeString(LS_MIGRATED, userId);
  // локальные данные больше не нужны — БД источник истины
  removeKey(LS_KEY);
}

// Запрос досок своего бэкенда кэшируется по id пользователя: в dev StrictMode
// эффект монтируется дважды, и без кэша обе гонки успевают создать дефолтные
// доски (дубли). Сервер тоже подстрахован — стартовые доски создаются с
// if_missing.
const loadCache = new Map<string, Promise<Board[]>>();

export function loadServerBoards(userId: string): Promise<Board[]> {
  const cached = loadCache.get(userId);
  if (cached) return cached;
  const pending = (async () => {
    const boards = await apiBoards();
    await migrateLocalBoards(userId, boards);
    if (boards.length === 0) {
      // первый вход: seeded-доски создаём на сервере
      for (const title of DEFAULT_BOARD_TITLES) {
        boards.push(await apiCreateBoard(title, { ifMissing: true }));
      }
    }
    return boards;
  })();
  loadCache.set(userId, pending);
  return pending;
}

// После сбоя записи сервер — источник истины: снимаем кэш, чтобы перечитать.
export function forgetServerBoards(userId: string): void {
  loadCache.delete(userId);
}

export function forgetAllServerBoards(): void {
  loadCache.clear();
}
