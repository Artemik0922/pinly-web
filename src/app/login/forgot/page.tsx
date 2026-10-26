"use client";

// Восстановление пароля: письмо со ссылкой → здесь ввод нового пароля.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

function ForgotForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = getSupabase();
  const isRecovery = params.get("mode") === "recovery";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/forgot?mode=recovery`,
    });
    if (err) setError("Не удалось отправить письмо.");
    else setSent(true);
  };

  const setNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase!.auth.updateUser({ password });
    if (err) setError("Не удалось изменить пароль. Возможно, ссылка устарела.");
    else {
      setDone(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">
        {isRecovery ? "Новый пароль" : "Восстановление пароля"}
      </h1>

      {isRecovery ? (
        done ? (
          <p className="mt-8 text-center text-sm text-green-700">
            Пароль изменён. Перенаправляем в ленту…
          </p>
        ) : (
          <form onSubmit={setNewPassword} className="mt-8 space-y-3">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Новый пароль (минимум 8 символов)"
              className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white hover:brightness-110"
            >
              Сохранить пароль
            </button>
          </form>
        )
      ) : sent ? (
        <p className="mt-8 text-center text-sm text-muted">
          Письмо со ссылкой для восстановления отправлено на {email}.
        </p>
      ) : (
        <form onSubmit={sendRecovery} className="mt-8 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Ваш email"
            className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white hover:brightness-110"
          >
            Отправить ссылку
          </button>
        </form>
      )}
    </div>
  );
}

export default function ForgotPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>}>
      <ForgotForm />
    </Suspense>
  );
}
