"use client";

import { useEffect, useRef } from "react";
import { IconPin, IconSend } from "@/components/ui/Icons";

export function Composer({
  text,
  setText,
  sendText,
  onOpenPicker,
}: {
  text: string;
  setText: (value: string) => void;
  sendText: () => void;
  onOpenPicker: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- авт grow композера ---
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [text]);

  return (
    <div className="sticky bottom-0 -mx-4 mt-3 border-t border-border-soft bg-background/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label="Отправить пин"
          title="Отправить пин"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface hover:bg-surface-hover"
        >
          <IconPin size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendText();
            }
          }}
          rows={1}
          placeholder="Сообщение…"
          aria-label="Текст сообщения"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={sendText}
          disabled={!text.trim()}
          aria-label="Отправить"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-30"
        >
          <IconSend size={18} />
        </button>
      </div>
    </div>
  );
}
