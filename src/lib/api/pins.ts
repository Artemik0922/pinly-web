// Свои пины (backend/pins.py).

import type { Pin } from "@/lib/pin";
import { requestJson, requestMultipart } from "@/lib/api/http";

export type NewPinForm = {
  file: File;
  title: string;
  description: string;
  category: string;
  tags: string[];
  width: number;
  height: number;
};

export async function apiCreatePin(form: NewPinForm): Promise<Pin> {
  const fd = new FormData();
  fd.set("file", form.file);
  fd.set("title", form.title);
  fd.set("description", form.description);
  fd.set("category", form.category);
  fd.set("tags", form.tags.join(","));
  fd.set("width", String(form.width));
  fd.set("height", String(form.height));
  return (await requestMultipart<{ pin: Pin }>("/api/pins", fd)).pin;
}

// ключи совпадают с pydantic-моделью бэкенда (snake_case)
export async function apiCreatePinFromUrl(body: {
  sourceUrl: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  width: number;
  height: number;
}): Promise<Pin> {
  const data = await requestJson<{ pin: Pin }>("/api/pins/from-url", {
    method: "POST",
    body: JSON.stringify({
      source_url: body.sourceUrl,
      title: body.title,
      description: body.description,
      category: body.category,
      tags: body.tags,
      width: body.width,
      height: body.height,
    }),
  });
  return data.pin;
}

export async function apiUpdatePin(
  pinId: string,
  patch: { title?: string; description?: string; category?: string; tags?: string[] },
): Promise<Pin> {
  const data = await requestJson<{ pin: Pin }>(`/api/pins/${pinId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.pin;
}

export async function apiDeletePin(pinId: string): Promise<void> {
  await requestJson(`/api/pins/${pinId}`, { method: "DELETE" });
}
