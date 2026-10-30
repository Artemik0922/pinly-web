"use client";

// Создание своего пина: картинка с устройства + описание.
// Размеры изображения читает браузер и присылает на бэкенд,
// поэтому на сервере не нужны библиотеки вроде Pillow.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/data/pins";
import { apiCreatePin, apiCreatePinFromUrl, apiMediaList } from "@/lib/account";
import { useBoards } from "@/lib/store";
import { useUser } from "@/lib/user";
import { IconImage } from "@/components/Icons";

const MAX_FILE_MB = 10;

export default function NewPinPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Загрузка…</p>}>
      <NewPinInner />
    </Suspense>
  );
}

function NewPinInner() {
  const router = useRouter();
  const { user, ready, enabled } = useUser();
  const { boards, togglePin } = useBoards();
  const searchParams = useSearchParams();

  // Картинка и её размеры живут одной состоянием: превью, проверка
  // и загрузка всегда относятся к одному источнику. Размеры читает браузер —
  // на сервере не нужен Pillow. Источник два: файл с устройства
  // (file) или картинка на внешнем хостинге (sourceUrl).
  const [image, setImage] = useState<{
    file?: File;
    sourceUrl?: string;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const urlRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0] ?? "");
  const [tags, setTags] = useState("");
  const [boardId, setBoardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Blob-URL отдаём загрузчику: при уходе со страницы освобождаем память
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // Возврат назад после публикации: браузер восстанавливает страницу из
  // bfcache вместе с залипшим «Публикуем…» — сбрасываем состояние формы
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBusy(false);
        setImage(null);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Предзаполнение из медиатеки: /pin/new?media=<id>
  const mediaId = searchParams.get("media");
  const mediaTaken = useRef<string | null>(null);
  useEffect(() => {
    if (!mediaId || !user || mediaTaken.current === mediaId) return;
    mediaTaken.current = mediaId;
    let cancelled = false;
    (async () => {
      try {
        const items = await apiMediaList();
        const item = items.find((m) => m.id === mediaId);
        if (!item || cancelled) return;
        if (item.external) {
          // картинка на внешнем хостинге: файл не пересылаем, пин
          // публикуется со ссылкой (показ идёт через наш прокси)
          setImage({
            sourceUrl: item.url,
            url: item.url,
            width: item.width || 800,
            height: item.height || 1000,
          });
        } else {
          const blob = await fetch(item.url).then((r) => r.blob());
          if (cancelled) return;
          const ext = item.url.split(".").pop() ?? "png";
          const f = new File([blob], `media.${ext}`, { type: blob.type || "image/png" });
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          const url = URL.createObjectURL(f);
          urlRef.current = url;
          setImage({
            file: f,
            url,
            width: item.width || 800,
            height: item.height || 1000,
          });
        }
        setTitle((t) => t || item.title);
      } catch {
        setError("Не удалось взять картинку из медиатеки.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaId, user]);

  if (!ready) {
    return <p className="py-20 text-center text-sm text-muted">Загрузка…</p>;
  }

  if (!enabled || !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Создание пинов — для своих</h1>
        <p className="mt-3 text-muted">Войдите, чтобы загружать собственные идеи.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          Войти
        </Link>
      </div>
    );
  }

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Файл больше ${MAX_FILE_MB} МБ`);
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      setError("Поддерживаются JPG, PNG и WebP");
      return;
    }
    setError(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    const img = new Image();
    img.onload = () =>
      setImage({ file: f, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      urlRef.current = null;
      setImage(null);
      setError("Файл не читается как картинка.");
    };
    img.src = url;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) {
      setError("Выберите картинку");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const common = {
        title,
        description,
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        width: image.width,
        height: image.height,
      };
      // источник два: файл (локальное хранилище) или ссылка на внешний
      // хостинг (ImgBB и т.п.) — для внешнего файл не пересылаем
      const pin = image.file
        ? await apiCreatePin({ file: image.file, ...common })
        : await apiCreatePinFromUrl({ sourceUrl: image.sourceUrl ?? "", ...common });
      if (boardId) togglePin(boardId, pin);
      router.push(`/pin/${pin.id}`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      const status = (err as { status?: number }).status;
      setError(
        status === 401
          ? "Сессия истекла — войдите заново."
          : status === 413
            ? `Файл больше ${MAX_FILE_MB} МБ.`
            : "Не удалось загрузить пин. Проверьте, что бэкенд запущен.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8">
      <h1 className="text-center text-2xl font-extrabold">Новый пин</h1>

      <form
        onSubmit={submit}
        className="mt-8 grid gap-6 rounded-[32px] bg-surface-card p-4 sm:p-6 md:grid-cols-2"
      >
        {/* Картинка */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`grid min-h-[280px] place-items-center rounded-3xl border-2 border-dashed p-4 transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-border-soft"
          }`}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- локальный blob-превью
            <img
              src={image.url}
              alt="Превью"
              className="max-h-[420px] rounded-2xl object-contain"
            />
          ) : (
            <div className="text-center text-muted">
              <IconImage size={40} className="mx-auto" />
              <p className="mt-3 text-sm font-semibold">Перетащите картинку сюда</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
              >
                Выбрать файл
              </button>
              <p className="mt-2 text-xs text-muted">JPG, PNG или WebP, до {MAX_FILE_MB} МБ</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        {/* Поля */}
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
            maxLength={120}
            className="w-full rounded-2xl bg-surface px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-accent/40"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание — что на картинке и чем полезно"
            rows={4}
            maxLength={2000}
            className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <label className="text-xs font-semibold text-muted">
            Категория
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-surface px-4 py-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-accent/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Теги через запятую: кухня, светлое дерево"
            className="w-full rounded-2xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <label className="text-xs font-semibold text-muted">
            Сохранить в доску
            <select
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-surface px-4 py-3 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">— не сохранять —</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Публикуем…" : "Опубликовать"}
          </button>
        </div>
      </form>
    </div>
  );
}
