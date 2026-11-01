"use client";

// Сетка хранимых картинок: пустой экран, загрузка списка и карточки с
// двумя действиями — сделать пин и удалить.

import { useRouter } from "next/navigation";
import type { MediaItem } from "@/lib/api/media";
import { IconImage, IconPlus, IconTrash } from "@/components/ui/Icons";

export function MediaGrid({
  items,
  onRemove,
}: {
  items: MediaItem[] | null;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();

  if (items === null) {
    return <p className="py-16 text-center text-sm text-muted">Загрузка…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-muted">
        <IconImage size={40} className="mx-auto" />
        <p className="mt-3">Пока пусто. Загрузите первую картинку.</p>
      </div>
    );
  }

  return (
    <ul className="mt-8 columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
      {items.map((item) => (
        <li key={item.id} className="mb-4 break-inside-avoid">
          <div className="overflow-hidden rounded-2xl bg-surface-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- свой маршрут /api/uploads */}
            <img src={item.url} alt={item.title || "Картинка"} className="w-full" />
            <div className="flex items-center gap-1 p-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {item.title || "Без названия"}
              </span>
              <button
                type="button"
                onClick={() => router.push(`/pin/new?media=${item.id}`)}
                aria-label="Создать пин из этой картинки"
                className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background hover:opacity-90"
              >
                <IconPlus size={15} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
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
  );
}
