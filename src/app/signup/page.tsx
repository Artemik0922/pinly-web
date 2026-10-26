"use client";

// Регистрация с явным согласием на обработку персональных данных (152-ФЗ).
// Факт согласия логируется в consent_log (user_id, версия документа, UA).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";

const PRIVACY_VERSION = "1.0";

export default function SignupPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabaseEnabled()) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Регистрация недоступна</h1>
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

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Без согласия на обработку персональных данных регистрация невозможна.");
      return;
    }
    setBusy(true);

    const { data, error: err } = await supabase!.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() || undefined } },
    });
    if (err) {
      setBusy(false);
      setError(err.message === "User already registered" ? "Такой email уже зарегистрирован." : "Не удалось создать аккаунт. Проверьте данные.");
      return;
    }

    // Лог согласия (152-ФЗ): доказуемая фиксация факта и версии документа.
    if (data.user) {
      await supabase!.from("consent_log").insert({
        user_id: data.user.id,
        email,
        kind: "signup",
        doc_version: PRIVACY_VERSION,
        user_agent: navigator.userAgent,
      });
    }

    setBusy(false);
    router.push("/login?check-email=1");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">Регистрация</h1>

      <form onSubmit={signUp} className="mt-8 space-y-3">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Имя (как вас показывать)"
          className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (минимум 8 символов)"
          className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />

        <label className="flex items-start gap-3 rounded-2xl bg-surface-card p-4 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
          />
          <span>
            Я даю согласие на обработку моих персональных данных (email, имя) в
            соответствии с{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-accent hover:underline">
              Политикой конфиденциальности
            </Link>{" "}
            и принимаю{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-accent hover:underline">
              Пользовательское соглашение
            </Link>{" "}
            в соответствии с Федеральным законом №152-ФЗ «О персональных данных».
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Создаём аккаунт…" : "Зарегистрироваться"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
