"use client";

// Детальный просмотр пина: карточка с картинкой и информацией,
// ниже — masonry похожих пинов. Действия вынесены рядом: PinActions
// (скачать/поделиться/в чат) и OwnerControls (править/удалить) — свои файлы.

import Link from "next/link";
import { useEffect } from "react";
import { sourceLabel, type Pin } from "@/lib/pin";
import { categoryHref } from "@/lib/categories";
import { track } from "@/lib/track";
import { PinImage } from "@/components/feed/PinCard";
import { Avatar } from "@/components/ui/Avatar";
import { Comments } from "@/components/pin/Comments";
import { MasonryGrid } from "@/components/ui/MasonryGrid";
import { OwnerControls } from "@/components/pin/OwnerControls";
import { PinActions } from "@/components/pin/PinActions";
import { SaveControls } from "@/components/pin/SaveControls";
import { IconArrowLeft, IconHeart } from "@/components/ui/Icons";
import { useLikes } from "@/lib/state/likes";

// Кликабельный лайк: контур → залитое сердце, счётчик учитывает ваш.
function LikeButton({ pinId, baseLikes }: { pinId: string; baseLikes: number }) {
  const { isLiked, toggle } = useLikes();
  const liked = isLiked(pinId);
  const shown = Math.max(0, baseLikes + (liked ? 1 : 0));

  return (
    <button
      type="button"
      onClick={() => toggle(pinId)}
      aria-pressed={liked}
      aria-label={liked ? "Убрать лайк" : "Поставить лайк"}
      className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors ${
        liked ? "text-accent-strong" : "text-muted hover:bg-surface"
      }`}
    >
      <IconHeart size={18} filled={liked} />
      {shown > 0 && <span>{shown}</span>}
    </button>
  );
}

// Аватар без сети: цветной круг с инициалами.
function AuthorBlock({ pin }: { pin: Pin }) {
  const content = (
    <div className="flex items-center gap-3 border-t border-border-soft pt-5">
      <Avatar name={pin.author} url={pin.authorAvatar ?? null} size={40} textSize="text-sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{pin.author}</p>
        {pin.pageUrl ? (
          <a
            href={pin.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-muted"
          >
            источник: {sourceLabel(pin) || "не указан"}
          </a>
        ) : (
          <p className="text-xs text-muted">{pin.userId ? "профиль автора" : "автор пина"}</p>
        )}
      </div>
    </div>
  );
  // Свои пины ведут на профиль автора; у Openverse-авторов профиля нет.
  return pin.userId ? (
    <Link href={`/profile/${pin.userId}`} className="block hover:opacity-90">
      {content}
    </Link>
  ) : (
    content
  );
}

export function PinDetail({ pin, related }: { pin: Pin; related: Pin[] }) {
  // Показ страницы пина — главный вход с поиска и из мессенджеров. Без него
  // индексируемые страницы оставались единственными, о которых ничего не известно.
  useEffect(() => {
    track.pinView(pin.id);
  }, [pin.id]);

  return (
    <div className="mx-auto w-full max-w-[1050px] px-4">
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface"
      >
        <IconArrowLeft size={16} />В ленту
      </Link>

      <section className="mt-4 grid gap-8 rounded-[32px] bg-surface-card p-4 sm:p-6 md:grid-cols-2">
        <div className="m-auto w-full">
          <PinImage pin={pin} preload sizes="(max-width: 768px) 92vw, 45vw" />
        </div>

        <div className="flex flex-col py-2">
          <div className="flex items-center justify-between gap-3">
            <LikeButton pinId={pin.id} baseLikes={pin.likes} />
            <SaveControls pin={pin} size="large" />
          </div>
          <PinActions pin={pin} />

          <h1 className="mt-4 text-2xl font-bold leading-snug sm:text-3xl">{pin.title}</h1>
          {pin.description && (
            <p className="mt-3 leading-relaxed text-foreground">{pin.description}</p>
          )}

          <Link
            href={categoryHref(pin.category)}
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-black/5 hover:bg-surface"
          >
            {pin.category}
          </Link>

          <ul className="mt-4 flex flex-wrap gap-2">
            {pin.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  className="block rounded-full bg-background px-3 py-1.5 text-sm text-muted shadow-sm ring-1 ring-black/5 hover:bg-surface"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <AuthorBlock pin={pin} />
            </div>
            <div className="shrink-0">
              <OwnerControls pin={pin} />
            </div>
          </div>
        </div>
      </section>

      <Comments pinId={pin.id} pinOwnerId={pin.userId} />

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-center text-lg font-bold">Похожие пины</h2>
          <MasonryGrid pins={related} />
        </section>
      )}
    </div>
  );
}
