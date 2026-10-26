"use client";

// Сессия пользователя. Без Supabase-конфига user === null навсегда —
// сайт работает анонимно, как раньше.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";

type UserContextValue = {
  user: User | null;
  ready: boolean;
  enabled: boolean;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  ready: false,
  enabled: false,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled());

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }: { data: { session: { user: User } | null } }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User } | null) => {
        setUser(session?.user ?? null);
      },
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, ready, enabled: supabaseEnabled() }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
