"use client";

// Медиатека — личный хостинг картинок: загрузка файлом или по ссылке
// с любого внешнего хостинга, из хранилища пины создаются в один клик.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  apiMediaDelete,
  apiMediaExternalStatus,
  apiMediaExternalUpload,
  apiMediaFromUrl,
  apiMediaList,
  apiMediaUpload,
  type MediaItem,
} from "@/lib/account";
import { useUser } from "@/lib/user";
import { IconImage, IconPlus, IconTrash } from "@/components/Icons";

const MAX_FILE_MB = 10;

async function probeDims(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

export default function MediaPage() {
  const router = useRouter();
  const { user, ready, enabled } = useUser();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<"local" | "imgbb">("local");
  const [imgbbEnabled, setImgbbEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userReadyGate(ready, enabled, user)) return;
    apiMediaList()
      .then(setItems)
      .catch(() => setItems([]));
    apiMediaExternalStatus()
      .then(setImgbbEnabled)
      .catch(() => setImgbbEnabled(false));
  }, [ready, enabled, user]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of [...files]) {
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          setError(`«${f.name}» больше ${MAX_FILE_MB} МБ — пропущен`);
          continue;
        }
        const dims = await probeDims(URL.createObjectURL(f));
        if (target === "imgbb") {
          await apiMediaExternalUpload(f);
        } else {
          await apiMediaUpload(f, dims);
        }
      }
      setItems(await apiMediaList());
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 501
          ? "Внешний хостинг не настроен: добавь IMGBB_API_KEY в web/.env.local (бесплатный ключ на api.imgbb.com) и перезапусти бэкенд."
          : "Не удалось загрузить. Проверьте, что бэкенд запущен.",
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadUrl = async () => {
    const clean = url.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const dims = await probeDims(clean);
      await apiMediaFromUrl(clean, dims);
      setUrl("");
      setItems(await apiMediaList());
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 502
          ? "Хостинг не отдал картинку. Проверьте ссылку."
          : status === 413
            ? "Картинка больше 10 МБ."
            : "Не удалось забрать картинку по ссылке.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await apiMediaDelete(id).catch(() => undefined);
    setItems((prev) => prev?.filter((m) => m.id !== id) ?? null);
  };

  if (!ready) {
    return <p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>;
  }
  if (!enabled || !user) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-extrabold">Медиатека — для своих</h1>
        <p className="mt-3 text-muted">Войдите, чтобы хранить свои картинки.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
      <h1 className="text-center text-2xl font-extrabold">Медиатека</h1>
      <p className="mt-2 text-center text-sm text-muted/80">
        Ваше хранилище картинок: файлом или по ссылке с любого хостинга.
        Из хранилища — пины в один клик.
      </p>

      <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && uploadUrl()}
            placeholder="Ссылка на картинку (https://…)"
            className="min-w-0 flex-1 rounded-full bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={uploadUrl}
            disabled={busy || !url.trim()}
            className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            По ссылке
          </button>
          <button
            type="button"
            onClick={() => {
              setTarget("local");
              inputRef.current?.click();
            }}
            disabled={busy}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              target === "local" ? "bg-surface ring-2 ring-accent/40" : "bg-surface hover:bg-surface-hover"
            }`}
          >
            Файлом к себе
          </button>
          <button
            type="button"
            onClick={() => {
              setTarget("imgbb");
              inputRef.current?.click();
            }}
            disabled={busy}
            title={
              imgbbEnabled
                ? "Файл уйдёт на бесплатный хостинг ImgBB, у нас останется ссылка"
                : "Нужен бесплатный ключ IMGBB_API_KEY в web/.env.local"
            }
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              target === "imgbb" ? "bg-surface ring-2 ring-accent/40" : "bg-surface hover:bg-surface-hover"
            }`}
          >
            На ImgBB
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {items === null ? (
        <p className="py-16 text-center text-sm text-muted/80">Загрузка…</p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-muted">
          <IconImage size={40} className="mx-auto" />
          <p className="mt-3">Пока пусто. Загрузите первую картинку.</p>
        </div>
      ) : (
        <ul className="mt-8 columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
          {items.map((m) => (
            <li key={m.id} className="mb-4 break-inside-avoid">
              <div className="overflow-hidden rounded-2xl bg-surface-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- свой маршрут /api/uploads */}
                <img src={m.url} alt={m.title || "Картинка"} className="w-full" />
                <div className="flex items-center gap-1 p-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted/80">
                    {m.title || "Без названия"}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/pin/new?media=${m.id}`)}
                    aria-label="Создать пин из этой картинки"
                    className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background hover:opacity-90"
                  >
                    <IconPlus size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    aria-label="Удалить из хранилища"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Гейт загрузки списков: ждём и готовность сессии
function userReadyGate(ready: boolean, enabled: boolean, user: unknown): boolean {
  return ready && enabled && user !== null;
}
