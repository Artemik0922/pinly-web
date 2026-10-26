"use client";

// Вход: email+пароль или через OIDC-провайдера (Yandex/VK, если включены).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    params.get("check-email")
      ? "Письмо с подтверждением отправлено на вашу почту. Подтвердите email и войдите."
      : null,
  );
  const [busy, setBusy] = useState(false);

  if (!supabaseEnabled()) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Вход недоступен</h1>
        <p className="mt-3 text-muted">
          Сервер авторизации ещё не подключён. Сайт работает в анонимном режиме.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Вернуться в ленту
        </Link>
      </div>
    );
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error: err } = await supabase!.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) {
      setError("Неверный email или пароль.");
      return;
    }
    router.push("/");
    router.refresh();
  };

  const signInOAuth = async (provider: "oidc") => {
    setError(null);
    await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">Вход в Pinly</h1>

      <form onSubmit={signIn} className="mt-8 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted/80">
        <span className="h-px flex-1 bg-surface" />
        или
        <span className="h-px flex-1 bg-surface" />
      </div>

      <button
        type="button"
        onClick={() => signInOAuth("oidc")}
        className="w-full rounded-full bg-[#fc3f1d] py-3 text-sm font-semibold text-white hover:brightness-110"
      >
        Войти через Yandex ID
      </button>
      <p className="mt-2 text-center text-xs text-muted/80">
        Кнопка VK ID появится автоматически, когда провайдер будет включён на сервере.
      </p>

      <p className="mt-8 text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          Зарегистрируйтесь
        </Link>
      </p>
      <p className="mt-4 text-center">
        <Link href="/login/forgot" className="text-xs text-muted/80 hover:text-muted">
          Забыли пароль?
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>}>
      <LoginInner />
    </Suspense>
  );
}
