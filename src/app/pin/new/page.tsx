"use client";

// Создание своего пина: картинка с устройства или из медиатеки + описание.
// Жизнью картинки (превью, blob-URL, размеры, проверка файла) ведёт хук
// usePinImage и его зона Dropzone; здесь — форма, публикация и доступ.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/data/mock-pins";
import { apiMediaList } from "@/lib/api/media";
import { apiCreatePin, apiCreatePinFromUrl } from "@/lib/api/pins";
import { isStatus } from "@/lib/api/http";
import { useBoards } from "@/lib/state/boards";
import { useUser } from "@/lib/state/session";
import { PinDropzone } from "@/components/pin/PinDropzone";
import { usePinImage } from "@/components/pin/usePinImage";
import { MAX_UPLOAD_MB } from "@/lib/upload-limits";

const MAX_FILE_MB = MAX_UPLOAD_MB;

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0] ?? "");
  const [tags, setTags] = useState("");
  const [boardId, setBoardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { image, pickFile, attachMedia, reset } = usePinImage(MAX_FILE_MB, setError);

  // Возврат назад после публикации: браузер восстанавливает страницу из
  // bfcache вместе с залипшим «Публикуем…» — сбрасываем состояние формы
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setBusy(false);
      reset();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [reset]);

  // Предзаполнение из медиатеки: /pin/new?media=<id>. Один раз на id: иначе
  // каждое обновление страницы перезаписывало бы уже отредактированный черновик.
  const mediaId = searchParams.get("media");
  const mediaTaken = useRef<string | null>(null);
  useEffect(() => {
    if (!mediaId || !user || mediaTaken.current === mediaId) return;
    mediaTaken.current = mediaId;
    let cancelled = false;
    apiMediaList()
      .then((items) => {
        const item = items.find((m) => m.id === mediaId);
        if (!item || cancelled) return;
        void attachMedia(item).catch(() =>
          setError("Не удалось взять картинку из медиатеки."),
        );
        setTitle((t) => t || item.title);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось взять картинку из медиатеки.");
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId, user, attachMedia]);

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
      const published = image.file
        ? await apiCreatePin({ file: image.file, ...common })
        : await apiCreatePinFromUrl({ sourceUrl: image.sourceUrl ?? "", ...common });
      if (boardId) togglePin(boardId, published);
      router.push(`/pin/${published.id}`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(
        isStatus(err, 401)
          ? "Сессия истекла — войдите заново."
          : isStatus(err, 413)
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
        <PinDropzone maxFileMb={MAX_FILE_MB} image={image} onPick={pickFile} />

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
