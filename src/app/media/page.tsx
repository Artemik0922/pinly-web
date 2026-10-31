"use client";

// Медиатека — личный хостинг картинок: загрузка файлом или по ссылке
// с любого внешнего хостинга, из хранилища пины создаются в один клик.
// Состояние — в useMediaLibrary, панель и сетка — свои компоненты.

import Link from "next/link";
import { MediaGrid } from "@/components/media/MediaGrid";
import { MediaUploader } from "@/components/media/MediaUploader";
import { useMediaLibrary } from "@/components/media/useMediaLibrary";

export default function MediaPage() {
  const library = useMediaLibrary();

  if (!library.ready) {
    return <p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>;
  }

  if (!library.enabled || !library.user) {
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

      <MediaUploader
        url={library.url}
        onUrlChange={library.setUrl}
        busy={library.busy}
        error={library.error}
        imgbbEnabled={library.imgbbEnabled}
        target={library.target}
        onTarget={library.setTarget}
        onUploadUrl={library.uploadUrl}
        onUploadFiles={library.uploadFiles}
      />

      <MediaGrid items={library.items} onRemove={library.remove} />
    </div>
  );
}
