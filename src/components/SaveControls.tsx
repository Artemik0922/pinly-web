"use client";

// Кнопка «Сохранить» с выбором доски. Два размера:
// compact — ховер-оверлей карточки в ленте, large — страница пина.

import { useState } from "react";
import type { Pin } from "@/data/pins";
import { useBoards } from "@/lib/store";
import { IconChevronDown, IconCheck } from "@/components/Icons";

export function SaveControls({ pin, size = "compact" }: { pin: Pin; size?: "compact" | "large" }) {
  const { boards, activeBoard, activeBoardId, setActiveBoardId, createBoard, togglePin, isSavedIn, ready } =
    useBoards();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const savedHere = activeBoardId ? isSavedIn(activeBoardId, pin.id) : false;

  const quickSave = () => {
    let boardId = activeBoardId;
    if (!boardId || !boards.some((b) => b.id === boardId)) {
      boardId = createBoard("Моя доска").id;
      setActiveBoardId(boardId);
    }
    togglePin(boardId, pin);
  };

  const submitNewBoard = () => {
    const board = createBoard(newTitle);
    togglePin(board.id, pin);
    setActiveBoardId(board.id);
    setNewTitle("");
    setOpen(false);
  };

  const large = size === "large";

  return (
    <div className="relative">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            large
              ? "flex items-center gap-1 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-surface"
              : "flex max-w-28 items-center gap-1 rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-background"
          }
        >
          <span className="truncate">{activeBoard?.title ?? "Доска"}</span>
          <IconChevronDown size={12} />
        </button>
        <button
          type="button"
          onClick={quickSave}
          disabled={!ready}
          className={
            savedHere
              ? large
                ? "rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
                : "rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
              : large
                ? "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
                : "rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          }
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
            className={
              large
                ? "absolute right-0 top-11 z-50 w-64 rounded-2xl bg-background p-3 shadow-xl ring-1 ring-border-soft"
                : "absolute right-0 top-9 z-50 w-60 rounded-2xl bg-background p-3 shadow-xl ring-1 ring-border-soft"
            }
          >
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted/80">
              Сохранить на доску
            </p>
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {boards.map((board) => {
                const checked = board.pins.some((p) => p.id === pin.id);
                return (
                  <li key={board.id}>
                    <button
                      type="button"
                      onClick={() => {
                        togglePin(board.id, pin);
                        setActiveBoardId(board.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface"
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                          checked ? "bg-accent text-white" : "bg-surface text-transparent"
                        }`}
                      >
                        <IconCheck size={12} />
                      </span>
                      <span className="flex-1 truncate">{board.title}</span>
                      <span className="text-xs text-muted/80">{board.pins.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex gap-1 border-t border-border-soft pt-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNewBoard()}
                placeholder="Новая доска…"
                className="min-w-0 flex-1 rounded-full bg-surface px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={submitNewBoard}
                disabled={!newTitle.trim()}
                className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
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
