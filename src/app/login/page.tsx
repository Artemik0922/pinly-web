"use client";

// Вход по email+паролю: сессию ставит Python-бэкенд (httpOnly-cookie).

import { useState } from "react";
import { apiLogin } from "@/lib/api/auth";
import { isStatus } from "@/lib/api/http";
import { AuthError, AuthShell, AuthSubmit } from "@/components/auth/AuthShell";
import { useAuthFlow } from "@/components/auth/useAuthFlow";
import { Field } from "@/components/ui/Field";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, start, finish, fail } = useAuthFlow();

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    start();
    try {
      await apiLogin(email, password);
      await finish();
    } catch (err) {
      fail(
        isStatus(err, 401)
          ? "Неверный email или пароль."
          : "Сервер авторизации недоступен. Проверьте, что запущен Python-бэкенд.",
      );
    }
  };

  return (
    <AuthShell
      title="Вход в Pinly"
      question="Нет аккаунта?"
      href="/signup"
      linkLabel="Зарегистрируйтесь"
    >
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
        <AuthError message={error} />
        <AuthSubmit busy={busy} label="Войти" busyLabel="Входим…" />
      </form>
    </AuthShell>
  );
}
