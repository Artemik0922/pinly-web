"use client";

// Детальный просмотр пина: карточка с картинкой и информацией,
// ниже — masonry похожих пинов.

import Link from "next/link";
import type { Pin } from "@/data/pins";
import { PinImage } from "@/components/PinCard";
import { SaveControls } from "@/components/SaveControls";
import { MasonryGrid } from "@/components/MasonryGrid";
import { IconArrowLeft, IconHeart } from "@/components/Icons";
import { useLikes } from "@/lib/likes";

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
        liked ? "text-accent" : "text-muted hover:bg-surface"
      }`}
    >
      <IconHeart size={18} filled={liked} />
      {shown > 0 && <span>{shown}</span>}
    </button>
  );
}

// Аватар без сети: цветной круг с инициалами.
function AuthorAvatar({ name }: { name: string }) {
  let hue = 0;
  for (const ch of name) hue = (hue * 37 + ch.codePointAt(0)!) % 360;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
      style={{ background: `hsl(${hue} 45% 45%)` }}
    >
      {initials}
    </span>
  );
}

export function PinDetail({ pin, related }: { pin: Pin; related: Pin[] }) {
  return (
    <div className="mx-auto w-full max-w-[1050px] px-4">
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface"
      >
        <IconArrowLeft size={16} />
        В ленту
      </Link>

      <section className="mt-4 grid gap-8 rounded-[32px] bg-surface-card p-4 sm:p-6 md:grid-cols-2">
        <div className="m-auto w-full">
          <PinImage pin={pin} />
        </div>

        <div className="flex flex-col py-2">
          <div className="flex items-center justify-between gap-3">
            <LikeButton pinId={pin.id} baseLikes={pin.likes} />
            <SaveControls pin={pin} size="large" />
          </div>

          <h1 className="mt-4 text-2xl font-bold leading-snug sm:text-3xl">{pin.title}</h1>
          {pin.description && (
            <p className="mt-3 leading-relaxed text-foreground">{pin.description}</p>
          )}

          <Link
            href={`/?category=${encodeURIComponent(pin.category)}`}
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

          <div className="mt-6 flex items-center gap-3 border-t border-border-soft pt-5">
            <AuthorAvatar name={pin.author} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{pin.author}</p>
              {pin.pageUrl ? (
                <a
                  href={pin.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted/80 hover:text-muted"
                >
                  источник: {pin.provider} · CC {pin.license}
                </a>
              ) : (
                <p className="text-xs text-muted/80">автор пина</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-center text-lg font-bold">Похожие пины</h2>
          <MasonryGrid pins={related} />
        </section>
      )}
    </div>
  );
}
