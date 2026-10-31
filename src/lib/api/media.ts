// Медиатека: личное хранилище картинок + внешний хостинг (backend/pins.py).

import { requestJson, requestMultipart } from "@/lib/api/http";

export type MediaItem = {
  id: string;
  title: string;
  url: string;
  external: boolean;
  width: number;
  height: number;
  createdAt: number;
};

type Dims = { width: number; height: number };

export async function apiMediaList(): Promise<MediaItem[]> {
  const data = await requestJson<{ items: MediaItem[] }>("/api/media");
  return data.items;
}

export async function apiMediaUpload(file: File, dims: Dims, title = ""): Promise<MediaItem> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("title", title);
  fd.set("width", String(dims.width));
  fd.set("height", String(dims.height));
  return (await requestMultipart<{ item: MediaItem }>("/api/media", fd)).item;
}

export async function apiMediaFromUrl(url: string, dims: Dims, title = ""): Promise<MediaItem> {
  const data = await requestJson<{ item: MediaItem }>("/api/media/url", {
    method: "POST",
    body: JSON.stringify({ url, title, width: dims.width, height: dims.height }),
  });
  return data.item;
}

export async function apiMediaDelete(mediaId: string): Promise<void> {
  await requestJson(`/api/media/${mediaId}`, { method: "DELETE" });
}

// Включён ли внешний хостинг: ключ ImgBB остаётся на бэкенде, клиенту
// виден только флаг — по нему страница прячет соответствующую кнопку.
export async function apiMediaExternalStatus(): Promise<boolean> {
  const data = await requestJson<{ enabled: boolean }>("/api/media/external");
  return data.enabled;
}

export async function apiMediaExternalUpload(file: File): Promise<MediaItem> {
  const fd = new FormData();
  fd.set("file", file);
  return (await requestMultipart<{ item: MediaItem }>("/api/media/external", fd)).item;
}
