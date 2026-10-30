"use client";

// Доски и сохранения в двух режимах:
//  - аноним: localStorage (как раньше)
//  - вошедший: SQLite бэкенда аккаунтов через /api/boards, с однократной
//    миграцией локальных досок при первом входе
// Ошибки записи не прячем: показываем toast и перечитываем доски с сервера,
// чтобы оптимистичный стейт не расходился с реальностью.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Pin } from "@/data/pins";
import {
  apiBoards,
  apiCreateBoard,
  apiDeleteBoard,
  apiRenameBoard,
  apiSavePin,
  apiToggleSecret,
  apiUnsavePin,
} from "@/lib/account";
import { useToast } from "@/components/Toast";
import { useUser } from "@/lib/user";

export type Board = {
  id: string;
  title: string;
  createdAt: number;
  // Секретная доска видна только владельцу: наружу её не отдают ни
  // публичный профиль, ни /api/boards/{id}/public.
  isSecret?: boolean;
  // Полное число пинов: список досок отдаёт pins срезом (экономия payload)
  pinsCount?: number;
  // Полные объекты пинов: динамические пины не существуют в локальных
  // моках, поэтому данные обязаны храниться вместе с доской.
  pins: Pin[];
};

const LS_KEY = "pinly:boards:v1";
const LS_MIGRATED = "pinly:boards:migrated";
const DEFAULT_TITLES = ["Идеи для дома", "Рецепты", "Вдохновение"];

type BoardsContextValue = {
  ready: boolean;
  boards: Board[];
  activeBoardId: string | null;
  setActiveBoardId: (id: string) => void;
  activeBoard: Board | null;
  createBoard: (title: string, isSecret?: boolean) => Promise<Board>;
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, title: string) => void;
  toggleSecret: (id: string) => void;
  togglePin: (boardId: string, pin: Pin) => void;
  isSavedIn: (boardId: string, pinId: string) => boolean;
};

const BoardsContext = createContext<BoardsContextValue | null>(null);

function newId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedDefaults(): Board[] {
  return DEFAULT_TITLES.map((title, i) => ({
    id: newId() + i,
    title,
    createdAt: Date.now() + i,
    pins: [],
  }));
}

function normalizeBoards(raw: unknown): Board[] {
  if (!Array.isArray(raw)) return seedDefaults();
  return (raw as Board[]).map((b) => ({
    ...b,
    pins: Array.isArray(b.pins) ? b.pins : [],
  }));
}

function loadLocal(): { boards: Board[]; activeBoardId: string | null } {
  if (typeof window === "undefined") return { boards: [], activeBoardId: null };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) {
      const boards = seedDefaults();
      return { boards, activeBoardId: boards[0]?.id ?? null };
    }
    const parsed = JSON.parse(raw) as { boards: Board[]; activeBoardId: string | null };
    const boards = normalizeBoards(parsed.boards);
    const activeBoardId =
      parsed.activeBoardId && boards.some((b) => b.id === parsed.activeBoardId)
        ? parsed.activeBoardId
        : (boards[0]?.id ?? null);
    return { boards, activeBoardId };
  } catch {
    return { boards: seedDefaults(), activeBoardId: null };
  }
}

function saveLocal(boards: Board[], activeBoardId: string | null) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ boards, activeBoardId }));
  } catch {
    // приватный режим — работаем без персиста
  }
}

// Загрузка досок своего бэкенда с однократной миграцией localStorage и
// созданием seeded-досок. Promise кэшируется по id пользователя: в dev
// StrictMode эффект монтируется дважды, и без кэша обе гонки успевают
// создать дефолтные доски (дубли). Сервер тоже подстрахован — стартовые
// доски создаются с if_missing.
const dbLoadCache = new Map<string, Promise<Board[]>>();

function loadDbBoards(userId: string): Promise<Board[]> {
  const cached = dbLoadCache.get(userId);
  if (cached) return cached;
  const promise = (async () => {
    const dbBoards = await apiBoards();

    // ── Однократная миграция localStorage → БД ──
    if (window.localStorage.getItem(LS_MIGRATED) !== userId) {
      const localWithPins = loadLocal().boards.filter((b) => b.pins.length > 0);
      for (const lb of localWithPins) {
        const created = await apiCreateBoard(lb.title, { ifMissing: true });
        for (const pin of lb.pins) {
          await apiSavePin(created.id, pin);
        }
        const imported = dbBoards.find((b) => b.id === created.id);
        if (imported) imported.pins = lb.pins;
        else dbBoards.push({ ...created, pins: lb.pins });
      }
      window.localStorage.setItem(LS_MIGRATED, userId);
      // локальные данные больше не нужны — БД источник истины
      window.localStorage.removeItem(LS_KEY);
    }

    if (dbBoards.length === 0) {
      // первый вход: seeded-доски создаём на сервере
      for (const title of DEFAULT_TITLES) {
        dbBoards.push(await apiCreateBoard(title, { ifMissing: true }));
      }
    }
    return dbBoards;
  })();
  dbLoadCache.set(userId, promise);
  return promise;
}

export function BoardsProvider({ children }: { children: ReactNode }) {
  const { user, ready: userReady } = useUser();
  const { show } = useToast();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const dbMode = user !== null;

  // Перечитать доски с сервера — после сбоя записи, чтобы стейт совпал с БД
  const reload = useCallback(() => {
    if (!user) return;
    dbLoadCache.delete(user.id);
    setReloadNonce((n) => n + 1);
  }, [user]);

  const failed = useCallback(
    (message: string) => {
      show(message);
      if (dbMode) reload();
    },
    [show, dbMode, reload],
  );

  // ── Загрузка при смене режима ──────────────────────────────────────
  useEffect(() => {
    if (!userReady) return;
    let cancelled = false;

    (async () => {
      if (dbMode && user) {
        // ── Свой бэкенд аккаунтов: доски в SQLite через /api/boards ──
        try {
          const loaded = await loadDbBoards(user.id);
          if (cancelled) return;
          setBoards(loaded);
          setActiveBoardIdState(loaded[0]?.id ?? null);
        } catch {
          // бэкенд недоступен (упал после логина) — деградация в локальный режим
          if (cancelled) return;
          const local = loadLocal();
          setBoards(local.boards);
          setActiveBoardIdState(local.activeBoardId);
        }
      } else {
        // аноним; заодно сбрасываем кэш — после повторного входа
        // доски загружаются заново, а не из стейла
        dbLoadCache.clear();
        const local = loadLocal();
        setBoards(local.boards);
        setActiveBoardIdState(local.activeBoardId);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userReady, dbMode, reloadNonce]);

  // Персист только в анонимном режиме
  useEffect(() => {
    if (!ready || dbMode) return;
    saveLocal(boards, activeBoardId);
  }, [ready, dbMode, boards, activeBoardId]);

  const createBoard = useCallback(
    async (title: string, isSecret = false): Promise<Board> => {
      const clean = title.trim() || "Новая доска";

      // В БД-режиме доска живёт только с серверным id: оптимистичная запись
      // с временным id ломала и ссылку (/board/b-… → «доски нет»), и
      // сохранение пина сразу после создания — PUT уходил на несуществующую
      // доску, 404 терял пин молча.
      if (dbMode) {
        try {
          const created = await apiCreateBoard(clean, { isSecret });
          const board: Board = { ...created, pins: created.pins ?? [] };
          setBoards((prev) => {
            if (!prev.length) setActiveBoardIdState(board.id);
            return [...prev, board];
          });
          return board;
        } catch {
          failed("Доска не создалась.");
          throw new Error("board_create_failed");
        }
      }

      const board: Board = {
        id: newId(),
        title: clean,
        createdAt: Date.now(),
        isSecret,
        pins: [],
      };
      setBoards((prev) => {
        const next = [...prev, board];
        if (!prev.length) setActiveBoardIdState(board.id);
        return next;
      });
      return board;
    },
    [dbMode, failed],
  );

  const deleteBoard = useCallback(
    (id: string) => {
      setBoards((prev) => prev.filter((b) => b.id !== id));
      if (dbMode) {
        apiDeleteBoard(id).catch(() => failed("Доска не удалилась."));
      }
    },
    [dbMode, failed],
  );

  // Признак «добавить или убрать» считаем ДО изменения стейта: апдейтер
  // setBoards вызывается дважды (StrictMode), и писать в замыкание из него
  // нельзя — можно отправить не тот запрос.
  const containsPin = useCallback(
    (boardId: string, pinId: string) =>
      boards.some((b) => b.id === boardId && b.pins.some((p) => p.id === pinId)),
    [boards],
  );

  const togglePin = useCallback(
    (boardId: string, pin: Pin) => {
      const added = !containsPin(boardId, pin.id);
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? {
                ...b,
                pins: added ? [pin, ...b.pins] : b.pins.filter((p) => p.id !== pin.id),
              }
            : b,
        ),
      );
      if (dbMode) {
        const call = added ? apiSavePin(boardId, pin) : apiUnsavePin(boardId, pin.id);
        call.catch(() => failed(added ? "Пин не сохранился в доску." : "Пин не убрать из доски."));
      }
    },
    [dbMode, containsPin, failed],
  );

  const renameBoard = useCallback(
    (id: string, title: string) => {
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
      if (dbMode) {
        apiRenameBoard(id, title).catch(() => failed("Название доски не изменилось."));
      }
    },
    [dbMode, failed],
  );

  const setActiveBoardId = useCallback((id: string) => setActiveBoardIdState(id), []);

  const toggleSecret = useCallback(
    (id: string) => {
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, isSecret: !b.isSecret } : b)));
      if (dbMode) {
        // сервер возвращает итоговый флаг — сверяем оптимистичный стейт с ним
        apiToggleSecret(id)
          .then((isSecret) =>
            setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, isSecret } : b))),
          )
          .catch(() => failed("Не удалось изменить доступность доски."));
      }
    },
    [dbMode, failed],
  );

  const isSavedIn = containsPin;

  const value = useMemo<BoardsContextValue>(
    () => ({
      ready,
      boards,
      activeBoardId,
      activeBoard: boards.find((b) => b.id === activeBoardId) ?? null,
      setActiveBoardId,
      createBoard,
      deleteBoard,
      renameBoard,
      toggleSecret,
      togglePin,
      isSavedIn,
    }),
    [
      ready,
      boards,
      activeBoardId,
      setActiveBoardId,
      createBoard,
      deleteBoard,
      renameBoard,
      toggleSecret,
      togglePin,
      isSavedIn,
    ],
  );

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>;
}

export function useBoards(): BoardsContextValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error("useBoards must be used inside BoardsProvider");
  return ctx;
}
