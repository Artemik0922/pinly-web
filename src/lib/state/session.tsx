"use client";

// Сессия пользователя — свой бэкенд аккаунтов (backend/accounts.py).
// Бэкенд не запущен: enabled=false, сайт работает анонимно, доски и лайки
// живут в localStorage.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiLogout, apiMe, type AccountUser, type MeResult } from "@/lib/api/auth";
import { onUnauthorized } from "@/lib/api/http";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
};

// Имя показываем даже незаполненного профиля: локаль почты понятнее, чем
// «Профиль», и этот фолбэк нужен в четырёх местах — держим его в одном.
function toSessionUser(account: AccountUser): SessionUser {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName || account.email.split("@")[0],
    avatarUrl: account.avatarUrl ?? null,
    createdAt: account.createdAt,
  };
}

type Session = {
  user: SessionUser | null;
  // бэкенд ответил хотя бы раз: без этого нельзя отличить «гость» от «сервер лежит»
  enabled: boolean;
};

const SIGNED_OUT: Session = { user: null, enabled: false };

type UserContextValue = Session & {
  ready: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  ...SIGNED_OUT,
  ready: false,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(SIGNED_OUT);
  const [ready, setReady] = useState(false);

  // Результат пробы сессии применяем в колбэке ответа, а не синхронно в теле
  // эффекта — иначе React считает это каскадным рендером.
  const applyMeResult = useCallback((res: MeResult) => {
    if (res.status === "ok") setSession({ user: toSessionUser(res.user), enabled: true });
    else if (res.status === "anon") setSession({ user: null, enabled: true });
    else setSession(SIGNED_OUT);
    setReady(true);
  }, []);

  // Одна проба сессии: при монтировании и после входа/выхода.
  const refreshUser = useCallback(async () => {
    applyMeResult(await apiMe());
  }, [applyMeResult]);

  useEffect(() => {
    void apiMe().then(applyMeResult);
  }, [applyMeResult]);

  // 401 от любого эндпоинта: cookie протух — переходим в анонимный режим,
  // сервер при этом жив (enabled остаётся).
  useEffect(
    () => onUnauthorized(() => setSession((prev) => ({ ...prev, user: null }))),
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // сессия и так исчезнет по exp; не мешаем выходу
    }
    setSession((prev) => ({ ...prev, user: null }));
  }, []);

  return (
    <UserContext.Provider value={{ ...session, ready, signOut, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
