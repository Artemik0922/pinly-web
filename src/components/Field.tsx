"use client";

// Поле формы с видимой подписью, подсказкой и переключателем пароля.
// Placeholder-подпись не считается меткой: она исчезает при вводе, и
// пользователь остаётся без понимания, что за поле.

import { useId, useState } from "react";
import { IconEye, IconEyeOff } from "@/components/Icons";

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
};

export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
  minLength,
  hint,
}: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isSecret = type === "password";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          // Семантический тип подсказывает браузеру клавиатуру и подсказки,
          // а переключение в text — то, что пользователь печатает.
          type={isSecret && shown ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40 ${
            isSecret ? "pr-12" : ""
          }`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
            aria-pressed={shown}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground"
          >
            {shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
