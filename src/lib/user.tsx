"use client";

// Сессия пользователя — свой бэкенд аккаунтов (backend/app.py).
// Бэкенд не запущен: enabled=false, сайт работает анонимно, доски и лайки
// живут в localStorage.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiLogout, apiMe, onUnauthorized, type AccountUser } from "@/lib/account";

export type SessionUser = {
  id: string;
  email?: string;
  created_at?: string;
  user_metadata?: { display_name?: string; avatar_url?: string } | null;
};

function fromAccount(u: AccountUser): SessionUser {
  return {
    id: u.id,
    email: u.email,
    created_at: new Date(u.createdAt).toISOString(),
    user_metadata: {
      display_name: u.displayName || undefined,
      avatar_url: u.avatarUrl ?? undefined,
    },
  };
}

type UserContextValue = {
  user: SessionUser | null;
  ready: boolean;
  enabled: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  ready: false,
  enabled: false,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [backendUp, setBackendUp] = useState(false);

  // Одна проба сессии: при монтировании и после входа/выхода
  const probeSession = useCallback(async () => {
    const res = await apiMe();
    if (res.status === "ok") {
      setUser(fromAccount(res.user));
      setBackendUp(true);
    } else if (res.status === "anon") {
      setUser(null);
      setBackendUp(true);
    } else {
      setBackendUp(false);
    }
    setReady(true);
  }, []);

  // Проба сессии при монтировании: состояние применяем в колбэке ответа,
  // а не синхронно в теле эффекта.
  useEffect(() => {
    let cancelled = false;
    apiMe().then((res) => {
      if (cancelled) return;
      if (res.status === "ok") {
        setUser(fromAccount(res.user));
        setBackendUp(true);
      } else if (res.status === "anon") {
        setUser(null);
        setBackendUp(true);
      } else {
        setBackendUp(false);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // сессия и так исчезнет по exp; не мешаем выходу
    }
    setUser(null);
  }, []);

  // 401 от любого эндпоинта: cookie протух — переходим в анонимный режим.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  // Обновить сессию из контекста — вызывают страницы входа/регистрации,
  // чтобы шапка и провайдеры увидели пользователя без перезагрузки.
  const refreshUser = useCallback(async () => {
    await probeSession();
  }, [probeSession]);

  return (
    <UserContext.Provider value={{ user, ready, enabled: backendUp, signOut, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
