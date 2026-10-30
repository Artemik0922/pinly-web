"use client";

// Детальный просмотр пина: карточка с картинкой и информацией,
// ниже — masonry похожих пинов. Владельцу — редактирование и удаление.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Pin } from "@/data/pins";
import { CATEGORIES } from "@/data/pins";
import { apiDeletePin, apiUpdatePin } from "@/lib/account";
import { categoryHref } from "@/lib/categories";
import { countLabel } from "@/lib/plural";
import { PinImage } from "@/components/PinCard";
import { Avatar } from "@/components/Avatar";
import { Comments } from "@/components/Comments";
import { ConfirmDialog } from "@/components/Confirm";
import { SaveControls } from "@/components/SaveControls";
import { MasonryGrid } from "@/components/MasonryGrid";
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconHeart,
  IconPencil,
  IconShare,
  IconTrash,
} from "@/components/Icons";
import { useLikes } from "@/lib/likes";
import { useUser } from "@/lib/user";

// Скачать / поделиться / счётчик сохранений.
function PinActions({ pin }: { pin: Pin }) {
  const [copied, setCopied] = useState(false);

  // Свои пины: файл на нашем домене — download сработает нативно.
  // Openverse: прокси с Content-Disposition. У моков — кнопки нет.
  const downloadHref = pin.sourceUrl
    ? pin.sourceUrl.startsWith("/")
      ? pin.sourceUrl
      : `/api/img/download?u=${encodeURIComponent(pin.sourceUrl)}`
    : null;

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
    } catch {
      // fallback для старых браузеров
      const ta = document.createElement("textarea");
      ta.value = pageUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Deeplinks соцсетей: адрес страницы читаём в момент клика — на сервере
  // его нет, а в разметке он не участвует (иначе несовпадение гидрации).
  const shareNetworks = {
    telegram: (url: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    whatsapp: (url: string, text: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    vk: (url: string, text: string) =>
      `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  } as const;

  const openShare = (network: keyof typeof shareNetworks) => {
    const url = window.location.href;
    window.open(
      shareNetworks[network](url, `${pin.title} — Pinly`),
      "_blank",
      "noopener,noreferrer",
    );
  };

  // Нативный шеринг есть не во всех браузерах и не на всех платформах,
  // поэтому проверка живёт в обработчике: в разметке она превратилась бы
  // в расхождение гидрации.
  const shareOrFallback = () => {
    if (navigator.share) {
      navigator.share({ title: pin.title, url: window.location.href }).catch(() => undefined);
      return;
    }
    openShare("telegram");
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      {typeof pin.saves === "number" && pin.saves > 0 && (
        <span className="text-muted">
          {countLabel(pin.saves, "сохранение", "сохранения", "сохранений")}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {downloadHref && (
          <a
            href={downloadHref}
            download
            aria-label="Скачать картинку"
            className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover sm:h-9 sm:w-9"
          >
            <IconDownload size={17} />
          </a>
        )}
        <button
          type="button"
          onClick={shareOrFallback}
          aria-label="Поделиться"
          className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover sm:h-9 sm:w-9"
        >
          <IconShare size={17} />
        </button>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Копировать ссылку"
          className={`flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-surface ${
            copied ? "text-accent-strong" : "text-muted"
          }`}
        >
          {copied ? <IconCheck size={15} /> : <IconShare size={15} />}
          {copied ? "Скопировано" : "Копировать ссылку"}
        </button>
        {(
          [
            ["telegram", "Telegram"],
            ["whatsapp", "WhatsApp"],
            ["vk", "VK"],
          ] as const
        ).map(([network, label]) => (
          <button
            key={network}
            type="button"
            onClick={() => openShare(network)}
            className="rounded-full px-3 py-2 text-sm text-muted hover:bg-surface"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
            источник: {pin.provider} · CC {pin.license}
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

// Контролы владельца своего пина: редактирование и удаление.
function OwnerControls({ pin }: { pin: Pin }) {
  const { user } = useUser();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: pin.title,
    description: pin.description,
    category: pin.category,
    tags: pin.tags.join(", "),
  });

  if (!user || pin.userId !== user.id) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiUpdatePin(pin.id, {
        title: form.title,
        description: form.description,
        category: form.category,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setEditing(false);
      router.refresh();
    } catch {
      setError("Не удалось сохранить изменения.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiDeletePin(pin.id);
      router.push("/");
      router.refresh();
    } catch {
      setBusy(false);
      setError("Не удалось удалить пин.");
    }
  };

  if (editing) {
    return (
      <div className="mt-4 space-y-2 rounded-2xl bg-surface p-4">
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Название"
          maxLength={120}
          className="w-full rounded-xl bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent/40"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Описание"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <div className="flex gap-2">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="flex-1 rounded-xl bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="теги, через запятую"
            className="flex-[2] rounded-xl bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-full bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Редактировать пин"
          className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover sm:h-9 sm:w-9"
        >
          <IconPencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Удалить пин"
          className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover disabled:opacity-50 sm:h-9 sm:w-9"
        >
          <IconTrash size={16} />
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={confirming}
        title="Удалить пин?"
        body="Пин исчезнет из ленты, досок и поиска. Отменить это нельзя."
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          remove();
        }}
      />
    </div>
  );
}

export function PinDetail({ pin, related }: { pin: Pin; related: Pin[] }) {
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
