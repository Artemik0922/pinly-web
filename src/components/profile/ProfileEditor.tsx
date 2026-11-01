"use client";

// Редактирование своего профиля: имя и аватар. Данные берём из контекста
// сессии и после записи перечитываем сессию — тогда шапка и страницы видят
// новое имя без перезагрузки.

import Image from "next/image";
import { useRef, useState } from "react";
import { apiUpdateDisplayName, apiUploadAvatar } from "@/lib/api/auth";
import { useUser } from "@/lib/state/session";
import { IconUser } from "@/components/ui/Icons";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { user, refreshUser } = useUser();
  const [name, setName] = useState(user?.displayName ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarUrl = user?.avatarUrl ?? null;

  const pickAvatar = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Аватар больше 3 МБ");
      return;
    }
    setError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const cancel = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setError(null);
    onDone();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiUpdateDisplayName(name);
      if (avatarFile) await apiUploadAvatar(avatarFile);
      await refreshUser();
      cancel();
    } catch {
      setError("Не удалось сохранить профиль.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-center text-2xl font-extrabold sm:text-3xl">Редактирование профиля</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mt-8 space-y-4"
      >
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-foreground text-xl font-bold text-background"
            aria-label="Сменить аватар"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью
              <img src={avatarPreview} alt="Аватар" className="h-full w-full object-cover" />
            ) : avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Аватар"
                width={80}
                height={80}
                sizes="80px"
                className="h-full w-full object-cover"
              />
            ) : (
              <IconUser size={36} />
            )}
          </button>
          <span className="text-xs text-muted">JPG, PNG или WebP, до 3 МБ</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickAvatar(e.target.files?.[0])}
          />
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          maxLength={60}
          className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <p className="text-sm text-muted">{user?.email}</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-full bg-accent-fill py-3 text-sm font-semibold text-accent-on hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-full px-5 py-3 text-sm font-semibold text-muted hover:bg-surface"
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
