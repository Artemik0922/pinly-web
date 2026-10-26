"use client";

// Лайки пинов. Пока без БД — хранятся в localStorage; при появлении
// likes-таблицы провайдер заменяется, интерфейс прежний.

import { useCallback, useEffect, useState } from "react";

const KEY = "pinly:likes:v1";

function load(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function useLikes() {
  const [liked, setLiked] = useState<string[]>([]);

  useEffect(() => {
    setLiked(load());
  }, []);

  const isLiked = useCallback((pinId: string) => liked.includes(pinId), [liked]);

  const toggle = useCallback((pinId: string) => {
    setLiked((prev) => {
      const next = prev.includes(pinId) ? prev.filter((id) => id !== pinId) : [pinId, ...prev];
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { isLiked, toggle };
}
