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
import type { Pin } from "@/lib/pin";
import type { Board } from "@/lib/api/boards";
import {
  apiCreateBoard,
  apiDeleteBoard,
  apiRenameBoard,
  apiSavePin,
  apiToggleSecret,
  apiUnsavePin,
} from "@/lib/api/boards";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/lib/state/session";
import {
  forgetAllServerBoards,
  forgetServerBoards,
  loadLocal,
  loadServerBoards,
  newBoardId,
  saveLocal,
} from "@/lib/state/board-storage";

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
    forgetServerBoards(user.id);
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

    // Снапшот сервера мог приехать позже, чем запись пользователя: форма
    // создания доски живёт на странице сразу, а стартовые доски первого входа
    // создаются последовательно (~полсекунды). Без слияния доска, нажатая в это
    // окно, исчезала из списка, оставаясь на сервере.
    //
    // keepFrom — с какого момента записи считать «своими»: локальные доски
    // анонимного режима сервер не знает, и тащить их рядом с серверными
    // значило бы плодить дубли. Держим только то, что создано после старта
    // загрузки.
    const apply = (
      next: { boards: Board[]; activeBoardId: string | null },
      keepFrom: number | null = null,
    ) => {
      if (cancelled) return;
      if (keepFrom === null) {
        setBoards(next.boards);
      } else {
        setBoards((prev) => {
          const ids = new Set(next.boards.map((b) => b.id));
          const extra = prev.filter((b) => !ids.has(b.id) && b.createdAt >= keepFrom);
          return extra.length ? [...next.boards, ...extra] : next.boards;
        });
      }
      setActiveBoardIdState(next.activeBoardId);
    };

    (async () => {
      const startedAt = Date.now();
      if (dbMode && user) {
        // ── Свой бэкенд аккаунтов: доски в SQLite через /api/boards ──
        try {
          const loaded = await loadServerBoards(user.id);
          apply({ boards: loaded, activeBoardId: loaded[0]?.id ?? null }, startedAt);
        } catch {
          // бэкенд недоступен (упал после логина) — деградация в локальный режим
          apply(loadLocal(), startedAt);
        }
      } else {
        // аноним; заодно сбрасываем кэш — после повторного входа
        // доски загружаются заново, а не из стейла
        forgetAllServerBoards();
        apply(loadLocal());
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
    saveLocal({ boards, activeBoardId });
  }, [ready, dbMode, boards, activeBoardId]);

  const addToState = useCallback((board: Board) => {
    setBoards((prev) => {
      if (!prev.length) setActiveBoardIdState(board.id);
      return [...prev, board];
    });
  }, []);

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
          addToState(board);
          return board;
        } catch {
          failed("Доска не создалась.");
          throw new Error("board_create_failed");
        }
      }

      const board: Board = {
        id: newBoardId(),
        title: clean,
        createdAt: Date.now(),
        isSecret,
        pins: [],
      };
      addToState(board);
      return board;
    },
    [dbMode, failed, addToState],
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

  // Индекс «пин → его доски»: на ленте из 20 карточек и сотен сохранений
  // обход boards.some(...) каждой карточкой давал тысячи проверок на кадр.
  const savedBoards = useMemo(() => {
    const index = new Map<string, string[]>();
    for (const board of boards) {
      for (const pin of board.pins) {
        index.set(pin.id, [...(index.get(pin.id) ?? []), board.id]);
      }
    }
    return index;
  }, [boards]);

  // Признак «добавить или убрать» считаем ДО изменения стейта: апдейтер
  // setBoards вызывается дважды (StrictMode), и писать в замыкание из него
  // нельзя — можно отправить не тот запрос.
  const isSavedIn = useCallback(
    (boardId: string, pinId: string) => (savedBoards.get(pinId) ?? []).includes(boardId),
    [savedBoards],
  );

  const togglePin = useCallback(
    (boardId: string, pin: Pin) => {
      const added = !isSavedIn(boardId, pin.id);
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId
            ? { ...b, pins: added ? [pin, ...b.pins] : b.pins.filter((p) => p.id !== pin.id) }
            : b,
        ),
      );
      if (dbMode) {
        const call = added ? apiSavePin(boardId, pin) : apiUnsavePin(boardId, pin.id);
        call.catch(() =>
          failed(added ? "Пин не сохранился в доску." : "Пин не убрать из доски."),
        );
      }
    },
    [dbMode, isSavedIn, failed],
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

  const setActiveBoardId = useCallback((id: string) => setActiveBoardIdState(id), []);

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
