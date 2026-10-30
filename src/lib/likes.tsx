"use client";

// Лайки пинов: аноним — localStorage; вошедший — БД через /api/likes.
// Ошибка записи не молчит: показываем тост и сверяемся с сервером.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiLike, apiLikes, apiUnlike } from "@/lib/account";
import { useToast } from "@/components/Toast";
import { useUser } from "@/lib/user";

const KEY = "pinly:likes:v1";

function loadLocal(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

type LikesContextValue = {
  isLiked: (pinId: string) => boolean;
  toggle: (pinId: string) => void;
};

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useUser();
  const { show } = useToast();
  const [liked, setLiked] = useState<string[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.resolve(user ? apiLikes() : loadLocal())
      .then((likes) => {
        if (!cancelled) setLiked(likes);
      })
      .catch(() => {
        // бэкенд недоступен — локальный список
        if (!cancelled) setLiked(loadLocal());
      });
    return () => {
      cancelled = true;
    };
  }, [user, ready]);

  const isLiked = useCallback((pinId: string) => liked.includes(pinId), [liked]);

  const toggle = useCallback(
    (pinId: string) => {
      const has = liked.includes(pinId);
      const next = has ? liked.filter((id) => id !== pinId) : [pinId, ...liked];
      setLiked(next);
      if (user) {
        const call = has ? apiUnlike(pinId) : apiLike(pinId);
        call
          .then(() => undefined)
          .catch(() => {
            show(has ? "Лайк не убрать — сервер недоступен." : "Лайк не записался.");
            // возвращаем состояние в соответствие с сервером
            apiLikes()
              .then((server) => setLiked(server))
              .catch(() => undefined);
          });
      } else {
        try {
          window.localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // приватный режим — работаем без персиста
        }
      }
    },
    [liked, user, show],
  );

  const value = useMemo(() => ({ isLiked, toggle }), [isLiked, toggle]);

  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}

export function useLikes(): LikesContextValue {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error("useLikes must be used inside LikesProvider");
  return ctx;
}
