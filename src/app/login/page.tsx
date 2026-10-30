"use client";

// Вход по email+паролю: сессию ставит Python-бэкенд (httpOnly-cookie).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiLogin } from "@/lib/account";
import { useUser } from "@/lib/user";
import { Field } from "@/components/Field";

export default function LoginPage() {
  const router = useRouter();
  const { refreshUser } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiLogin(email, password);
      // шапка и провайдеры узнают о сессии без перезагрузки
      await refreshUser();
      router.push("/");
      router.refresh();
      return;
    } catch (err) {
      setBusy(false);
      setError(
        (err as { status?: number }).status === 401
          ? "Неверный email или пароль."
          : "Сервер авторизации недоступен. Проверьте, что запущен Python-бэкенд.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">Вход в Pinly</h1>

      <form onSubmit={signIn} className="mt-8 space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
        />
        <Field
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition-transform duration-150 ease-pop hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href="/signup" className="font-semibold text-accent-strong hover:underline">
          Зарегистрируйтесь
        </Link>
      </p>
    </div>
  );
}
