"use client";

// Кнопка «Сохранить» с выбором доски. Два размера:
// compact — оверлей карточки в ленте, large — страница пина.

import { useEffect, useState } from "react";
import type { Pin } from "@/data/pins";
import { useBoards } from "@/lib/store";
import { boardPinCount } from "@/lib/plural";
import { IconChevronDown, IconCheck } from "@/components/Icons";
import { track } from "@/lib/track";

export function SaveControls({ pin, size = "compact" }: { pin: Pin; size?: "compact" | "large" }) {
  const {
    boards,
    activeBoard,
    activeBoardId,
    setActiveBoardId,
    createBoard,
    togglePin,
    isSavedIn,
    ready,
  } = useBoards();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const savedHere = activeBoardId ? isSavedIn(activeBoardId, pin.id) : false;

  // Escape закрывает меню — мышью оно закрывается фоновой подложкой
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const quickSave = async () => {
    try {
      let boardId = activeBoardId;
      if (!boardId || !boards.some((b) => b.id === boardId)) {
        boardId = (await createBoard("Моя доска")).id;
      }
      setActiveBoardId(boardId);
      togglePin(boardId, pin);
      track.pinSave(pin.id, pin.category);
    } catch {
      // причину уже показал store — здесь только гасим неисполненное обещание
    }
  };

  const submitNewBoard = async () => {
    try {
      const board = await createBoard(newTitle);
      togglePin(board.id, pin);
      track.pinSave(pin.id, pin.category);
      setActiveBoardId(board.id);
      setNewTitle("");
      setOpen(false);
    } catch {
      // см. quickSave
    }
  };

  const large = size === "large";
  const triggerClass = large
    ? "flex min-h-11 items-center gap-1 rounded-full bg-surface px-4 text-sm font-semibold text-foreground hover:bg-surface-hover"
    : "flex min-h-9 max-w-28 items-center gap-1 rounded-full bg-background/95 px-3 text-xs font-semibold text-foreground hover:bg-background sm:min-h-11";
  const saveClass = savedHere
    ? "flex min-h-9 items-center justify-center rounded-full bg-foreground px-3 text-xs font-semibold text-background sm:min-h-11 sm:px-5 sm:text-sm"
    : "flex min-h-9 items-center justify-center rounded-full bg-accent-strong px-3 text-xs font-semibold text-white hover:brightness-110 sm:min-h-11 sm:px-5 sm:text-sm";

  return (
    <div className="relative">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          // Название пина в метке обязательно: на странице пина таких
          // переключателей десятки (карточки «похожего»), и без него
          // скринридер не отвечает на вопрос «в доску чего я сохраняю?»
          aria-label={`Доска для сохранения «${pin.title}»: ${activeBoard?.title ?? "выбрать"}`}
          className={triggerClass}
        >
          <span className="truncate">{activeBoard?.title ?? "Доска"}</span>
          <IconChevronDown size={12} />
        </button>
        <button
          type="button"
          onClick={quickSave}
          disabled={!ready}
          aria-pressed={savedHere}
          className={saveClass}
        >
          {savedHere ? "Сохранено" : "Сохранить"}
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть выбор доски"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={
              large
                ? "animate-pop absolute right-0 top-12 z-50 w-64 rounded-2xl bg-background p-3 shadow-overlay ring-1 ring-border-soft"
                : "animate-pop absolute right-0 top-10 z-50 w-60 rounded-2xl bg-background p-3 shadow-overlay ring-1 ring-border-soft"
            }
          >
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Сохранить на доску
            </p>
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {boards.map((board) => {
                const checked = board.pins.some((p) => p.id === pin.id);
                return (
                  <li key={board.id}>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => {
                        togglePin(board.id, pin);
                        setActiveBoardId(board.id);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm hover:bg-surface-hover"
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                          checked ? "bg-accent-strong text-white" : "bg-surface text-transparent"
                        }`}
                      >
                        <IconCheck size={12} />
                      </span>
                      <span className="flex-1 truncate">{board.title}</span>
                      <span className="text-xs text-muted">{boardPinCount(board)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex gap-1 border-t border-border-soft pt-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewBoard();
                }}
                placeholder="Новая доска…"
                aria-label="Название новой доски"
                className="min-w-0 flex-1 rounded-full bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={submitNewBoard}
                disabled={!newTitle.trim()}
                className="rounded-full bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-40"
              >
                Создать
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
