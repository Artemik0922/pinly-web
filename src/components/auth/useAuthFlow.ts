"use client";

// Общий ход авторизации: состояние «занято» и ошибки + финализация, после
// которой шапка и провайдеры видят новую сессию без перезагрузки страницы.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/lib/state/session";

export function useAuthFlow() {
  const router = useRouter();
  const { refreshUser } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setError(null);
    setBusy(true);
  };

  // успешный вход/выход: перечитываем сессию и уходим на нужную страницу;
  // setBusy(false) здесь не нужен — страница уходит
  // Регистрация попадает не в ленту, а в свои доски: там человек видит, что
  // ему показывать миру, а не чужие картинки.
  const finish = async (to = "/") => {
    await refreshUser();
    router.push(to);
    router.refresh();
  };

  const fail = (message: string) => {
    setBusy(false);
    setError(message);
  };

  return { busy, error, setError, start, finish, fail };
}
