"use client";

// Регистрация с явным согласием на обработку персональных данных (152-ФЗ).
// Факт согласия логирует сервер: consent_log (user_id, версия документа, UA).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRegister } from "@/lib/account";
import { useUser } from "@/lib/user";
import { Field } from "@/components/Field";

export default function SignupPage() {
  const router = useRouter();
  const { refreshUser } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Без согласия на обработку персональных данных регистрация невозможна.");
      return;
    }
    setBusy(true);
    try {
      await apiRegister({ email, password, displayName: displayName.trim(), consent });
      // шапка и провайдеры узнают о сессии без перезагрузки
      await refreshUser();
      router.push("/");
      router.refresh();
      return;
    } catch (err) {
      setBusy(false);
      const status = (err as { status?: number }).status;
      setError(
        status === 409
          ? "Такой email уже зарегистрирован."
          : status === 400
            ? "Проверьте данные: корректный email, пароль от 8 символов, согласие на обработку данных."
            : "Сервер регистрации недоступен. Попробуйте позже.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold">Регистрация</h1>

      <form onSubmit={signUp} className="mt-8 space-y-4">
        <Field
          label="Имя"
          autoComplete="nickname"
          value={displayName}
          onChange={setDisplayName}
          hint="Как вас показывать в ленте и комментариях"
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
          hint="Минимум 8 символов"
        />

        <label className="flex items-start gap-3 rounded-2xl bg-surface-card p-4 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            Я даю согласие на обработку моих персональных данных (email, имя) в соответствии с{" "}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold text-accent-strong hover:underline"
            >
              Политикой конфиденциальности
            </Link>{" "}
            и принимаю{" "}
            <Link
              href="/terms"
              target="_blank"
              className="font-semibold text-accent-strong hover:underline"
            >
              Пользовательское соглашение
            </Link>{" "}
            в соответствии с Федеральным законом №152-ФЗ «О персональных данных».
          </span>
        </label>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition-transform duration-150 ease-pop hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Создаём аккаунт…" : "Зарегистрироваться"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-semibold text-accent-strong hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
