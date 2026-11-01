"use client";

// Скачать / отправить в чат / поделиться / счётчик сохранений — действия
// вокруг пина, не его содержимое.

import { useState } from "react";
import type { Pin } from "@/lib/pin";
import { countLabel } from "@/lib/plural";
import { copyToClipboard, currentPageUrl, nativeShare } from "@/lib/share";
import { useUser } from "@/lib/state/session";
import { SendPinDialog } from "@/components/chat/SendPinDialog";
import { IconCheck, IconDownload, IconMessage, IconShare } from "@/components/ui/Icons";

// Deeplinks соцсетей: у каждого свой параметр текста, поэтому карта одна.
const SHARE_NETWORKS = {
  telegram: (url: string, text: string) =>
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  whatsapp: (url: string, text: string) =>
    `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  vk: (url: string, text: string) =>
    `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
} as const;

type ShareNetwork = keyof typeof SHARE_NETWORKS;

const ICON_BUTTON =
  "grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover";

export function PinActions({ pin }: { pin: Pin }) {
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const { user, ready, enabled } = useUser();

  // Свои пины: файл на нашем домене — download сработает нативно.
  // Openverse: прокси с Content-Disposition. У моков — кнопки нет.
  const downloadHref = pin.sourceUrl
    ? pin.sourceUrl.startsWith("/")
      ? pin.sourceUrl
      : `/api/img/download?u=${encodeURIComponent(pin.sourceUrl)}`
    : null;

  const copyLink = () => {
    if (!copyToClipboard(currentPageUrl())) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openShare = (network: ShareNetwork) => {
    window.open(
      SHARE_NETWORKS[network](currentPageUrl(), `${pin.title} — Pinly`),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareOrFallback = () => {
    if (nativeShare({ title: pin.title, url: currentPageUrl() })) return;
    openShare("telegram");
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      {typeof pin.saves === "number" && pin.saves > 0 && (
        <span className="text-muted">
          {countLabel(pin.saves, "сохранение", "сохранения", "сохранений")}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {ready && enabled && user && (
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            aria-label="Отправить в сообщении"
            className={ICON_BUTTON}
          >
            <IconMessage size={17} />
          </button>
        )}
        {downloadHref && (
          <a href={downloadHref} download aria-label="Скачать картинку" className={ICON_BUTTON}>
            <IconDownload size={17} />
          </a>
        )}
        <button type="button" onClick={shareOrFallback} aria-label="Поделиться" className={ICON_BUTTON}>
          <IconShare size={17} />
        </button>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Копировать ссылку"
          className={`flex min-h-11 items-center gap-2 rounded-full px-3 hover:bg-surface ${
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
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted hover:bg-surface"
          >
            {label}
          </button>
        ))}
      </div>
      <SendPinDialog open={sendOpen} pin={pin} onClose={() => setSendOpen(false)} />
    </div>
  );
}
