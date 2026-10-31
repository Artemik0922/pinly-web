"use client";

// Состояние медиатеки: список, загрузка файлом/по ссылке, удаление и флаг
// внешнего хостинга. Страница решает «что показать», хук — «как хранить».

import { useEffect, useState } from "react";
import {
  apiMediaDelete,
  apiMediaExternalStatus,
  apiMediaExternalUpload,
  apiMediaFromUrl,
  apiMediaList,
  apiMediaUpload,
  type MediaItem,
} from "@/lib/api/media";
import { isStatus } from "@/lib/api/http";
import { useUser } from "@/lib/state/session";
import { dimsFromFile, probeDims, type Dims } from "@/lib/image-dims";
import { MAX_UPLOAD_MB } from "@/lib/upload-limits";

const MAX_FILE_MB = MAX_UPLOAD_MB;
// нечитаемая картинка = размеры 0: сервер разберётся сам, это не повод
// отменять загрузку
const ZERO_DIMS: Dims = { width: 0, height: 0 };

export type UploadTarget = "local" | "imgbb";

export function useMediaLibrary() {
  const { user, ready, enabled } = useUser();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<UploadTarget>("local");
  const [imgbbEnabled, setImgbbEnabled] = useState(false);

  const signedIn = ready && enabled && user !== null;

  const reload = () => apiMediaList().then(setItems).catch(() => setItems([]));

  useEffect(() => {
    if (!signedIn) return;
    reload();
    apiMediaExternalStatus()
      .then(setImgbbEnabled)
      .catch(() => setImgbbEnabled(false));
  }, [signedIn]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of [...files]) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setError(`«${file.name}» больше ${MAX_FILE_MB} МБ — пропущен`);
          continue;
        }
        if (target === "imgbb") {
          await apiMediaExternalUpload(file);
        } else {
          await apiMediaUpload(file, await dimsFromFile(file).catch(() => ZERO_DIMS));
        }
      }
      await reload();
    } catch (err) {
      setError(
        isStatus(err, 501)
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
      await apiMediaFromUrl(clean, await probeDims(clean).catch(() => ZERO_DIMS));
      setUrl("");
      await reload();
    } catch (err) {
      setError(
        isStatus(err, 502)
          ? "Хостинг не отдал картинку. Проверьте ссылку."
          : isStatus(err, 413)
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

  return {
    ready,
    enabled,
    user,
    items,
    busy,
    error,
    url,
    setUrl,
    target,
    setTarget,
    imgbbEnabled,
    uploadFiles,
    uploadUrl,
    remove,
  };
}
