"use client";

// Регистрация с явным согласием на обработку персональных данных (152-ФЗ).
// Факт согласия логирует сервер: consent_log (user_id, версия документа, UA).

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRegister } from "@/lib/api/auth";
import { isStatus } from "@/lib/api/http";
import { AuthError, AuthShell, AuthSubmit } from "@/components/auth/AuthShell";
import { useAuthFlow } from "@/components/auth/useAuthFlow";
import { track } from "@/lib/track";
import { Field } from "@/components/ui/Field";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const { busy, error, start, finish, fail } = useAuthFlow();

  // Событие было объявлено с самого начала и ниоткуда не вызывалось: без него
  // не видно, сколько людей дошло до формы и отвалилось на ней.
  useEffect(() => {
    track.signupOpen();
  }, []);

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    start();
    if (!consent) {
      // fail, а не setError: кнопка не должна залипать disabled после отказа
      fail("Без согласия на обработку персональных данных регистрация невозможна.");
      return;
    }
    try {
      await apiRegister({ email, password, displayName: displayName.trim(), consent });
      // не в ленту чужих картинок, а к своим доскам — там объяснение, что
      // показывать заказчику
      await finish("/boards?welcome=1");
    } catch (err) {
      fail(
        isStatus(err, 409)
          ? "Такой email уже зарегистрирован."
          : isStatus(err, 400)
            ? "Проверьте данные: корректный email, пароль от 8 символов, согласие на обработку данных."
            : "Сервер регистрации недоступен. Попробуйте позже.",
      );
    }
  };

  return (
    <AuthShell
      title="Регистрация"
      question="Уже есть аккаунт?"
      href="/login"
      linkLabel="Войти"
    >
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

        <AuthError message={error} />
        <AuthSubmit busy={busy} label="Зарегистрироваться" busyLabel="Создаём аккаунт…" />
      </form>
    </AuthShell>
  );
}
