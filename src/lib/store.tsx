"use client";

// Доски и сохранения в двух режимах:
//  - аноним: localStorage (как раньше)
//  - вошедший: Supabase-БД (источник истины) + однократный импорт
//    локальных досок при первом входе
// Сервер не настроен — второй режим недостижим, работает localStorage.

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
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useUser } from "@/lib/user";

export type Board = {
  id: string;
  title: string;
  createdAt: number;
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
  createBoard: (title: string) => Board;
  deleteBoard: (id: string) => void;
  togglePin: (boardId: string, pin: Pin) => void;
  isSavedIn: (boardId: string, pinId: string) => boolean;
  savedBoardIds: (pinId: string) => string[];
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

export function BoardsProvider({ children }: { children: ReactNode }) {
  const { user, ready: userReady } = useUser();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const dbMode = supabaseEnabled() && user !== null;

  // ── Загрузка при смене режима ──────────────────────────────────────
  useEffect(() => {
    if (!userReady) return;
    let cancelled = false;

    (async () => {
      const supabase = getSupabase();
      if (supabaseEnabled() && user && supabase) {
        const { data } = await supabase
          .from("boards")
          .select("id, title, created_at, board_pins(pin_id, pin_data, added_at)")
          .order("created_at", { ascending: true });
        if (cancelled) return;

        type BoardRow = {
          id: string;
          title: string;
          created_at: string;
          board_pins: Array<{ pin_id: string; pin_data: Pin; added_at: string }> | null;
        };
        let dbBoards: Board[] = ((data ?? []) as BoardRow[]).map((row) => ({
          id: row.id,
          title: row.title,
          createdAt: new Date(row.created_at).getTime(),
          pins: (row.board_pins ?? [])
            .sort((a, b) => (a.added_at < b.added_at ? 1 : -1))
            .map((bp) => ({ ...(bp.pin_data as Pin), id: bp.pin_id })),
        }));

        // ── Однократная миграция localStorage → БД ──
        if (window.localStorage.getItem(LS_MIGRATED) !== user.id) {
          const local = loadLocal().boards;
          const localWithPins = local.filter((b) => b.pins.length > 0);
          if (localWithPins.length > 0) {
            for (const lb of localWithPins) {
              const { data: created, error } = await supabase
                .from("boards")
                .insert({ title: lb.title })
                .select("id")
                .single();
              if (error || !created) continue;
              const rows = lb.pins.map((pin) => ({
                board_id: created.id,
                pin_id: pin.id,
                pin_data: { ...pin, sourceUrl: pin.sourceUrl ?? undefined },
              }));
              if (rows.length) await supabase.from("board_pins").insert(rows);
              const imported = dbBoards.find((b) => b.id === created.id);
              if (imported) imported.pins = lb.pins;
            }
          }
          window.localStorage.setItem(LS_MIGRATED, user.id);
          // локальные данные больше не нужны — БД источник истины
          window.localStorage.removeItem(LS_KEY);
        }

        if (dbBoards.length === 0) {
          // первый вход: seeded-доски создаём на сервере
          const created: Board[] = [];
          for (const title of DEFAULT_TITLES) {
            const { data: row } = await supabase
              .from("boards")
              .insert({ title })
              .select("id, title, created_at")
              .single();
            if (row) {
              created.push({
                id: row.id,
                title: row.title,
                createdAt: new Date(row.created_at).getTime(),
                pins: [],
              });
            }
          }
          dbBoards = created;
        }

        setBoards(dbBoards);
        setActiveBoardIdState(dbBoards[0]?.id ?? null);
      } else {
        const local = loadLocal();
        setBoards(local.boards);
        setActiveBoardIdState(local.activeBoardId);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userReady]);

  // Персист только в анонимном режиме
  useEffect(() => {
    if (!ready || dbMode) return;
    saveLocal(boards, activeBoardId);
  }, [ready, dbMode, boards, activeBoardId]);

  const createBoard = useCallback(
    (title: string): Board => {
      const board: Board = {
        id: newId(),
        title: title.trim() || "Новая доска",
        createdAt: Date.now(),
        pins: [],
      };
      setBoards((prev) => {
        const next = [...prev, board];
        if (!prev.length) setActiveBoardIdState(board.id);
        return next;
      });
      const supabase = getSupabase();
      if (dbMode && supabase) {
        supabase
          .from("boards")
          .insert({ title: board.title })
          .select("id")
          .single()
          .then(({ data }: { data: { id: string } | null }) => {
            if (data?.id) {
              const serverId = data.id;
              setBoards((prev) =>
                prev.map((b) => (b.id === board.id ? { ...b, id: serverId } : b)),
              );
              setActiveBoardIdState((cur) => (cur === board.id ? serverId : cur));
            }
          });
      }
      return board;
    },
    [dbMode],
  );

  const deleteBoard = useCallback(
    (id: string) => {
      setBoards((prev) => prev.filter((b) => b.id !== id));
      const supabase = getSupabase();
      if (dbMode && supabase) {
        supabase.from("boards").delete().eq("id", id).then();
      }
    },
    [dbMode],
  );

  const togglePin = useCallback(
    (boardId: string, pin: Pin) => {
      let added = false;
      setBoards((prev) =>
        prev.map((b) => {
          if (b.id !== boardId) return b;
          const has = b.pins.some((p) => p.id === pin.id);
          added = !has;
          return {
            ...b,
            pins: has ? b.pins.filter((p) => p.id !== pin.id) : [pin, ...b.pins],
          };
        }),
      );
      const supabase = getSupabase();
      if (dbMode && supabase) {
        if (added) {
          supabase
            .from("board_pins")
            .upsert({
              board_id: boardId,
              pin_id: pin.id,
              pin_data: { ...pin, sourceUrl: pin.sourceUrl ?? undefined },
            })
            .then();
        } else {
          supabase
            .from("board_pins")
            .delete()
            .eq("board_id", boardId)
            .eq("pin_id", pin.id)
            .then();
        }
      }
    },
    [dbMode],
  );

  const setActiveBoardId = useCallback((id: string) => setActiveBoardIdState(id), []);

  const isSavedIn = useCallback(
    (boardId: string, pinId: string) =>
      boards.some((b) => b.id === boardId && b.pins.some((p) => p.id === pinId)),
    [boards],
  );

  const savedBoardIds = useCallback(
    (pinId: string) => boards.filter((b) => b.pins.some((p) => p.id === pinId)).map((b) => b.id),
    [boards],
  );

  const value = useMemo<BoardsContextValue>(
    () => ({
      ready,
      boards,
      activeBoardId,
      activeBoard: boards.find((b) => b.id === activeBoardId) ?? null,
      setActiveBoardId,
      createBoard,
      deleteBoard,
      togglePin,
      isSavedIn,
      savedBoardIds,
    }),
    [ready, boards, activeBoardId, setActiveBoardId, createBoard, deleteBoard, togglePin, isSavedIn, savedBoardIds],
  );

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>;
}

export function useBoards(): BoardsContextValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error("useBoards must be used inside BoardsProvider");
  return ctx;
}
