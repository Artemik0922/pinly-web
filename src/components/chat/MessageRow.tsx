"use client";

import { PinAttachment } from "@/components/chat/PinAttachment";
import type { Display } from "@/components/chat/useChatThread";

export function dayKey(ts: number): number {
  const d = new Date(ts);
  return Math.floor(
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000,
  );
}

function dayLabel(ts: number): string {
  const today = dayKey(Date.now());
  const diff = today - dayKey(ts);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return new Date(ts).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: diff > 365 ? "numeric" : undefined,
  });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageRow({
  message: m,
  mine,
  showDay,
}: {
  message: Display;
  mine: boolean;
  showDay: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {showDay && (
        <p className="py-2 text-center text-xs text-muted">
          {dayLabel(m.createdAt)}
        </p>
      )}
      {m.kind === "pin" && m.pin ? (
        <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
          <PinAttachment pin={m.pin} />
          {m.text && (
            <p
              className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-sm ${
                mine
                  ? "bg-foreground text-background"
                  : "bg-surface-card text-foreground"
              } ${m.pending ? "opacity-60" : ""}`}
            >
              {m.text}
            </p>
          )}
          {m.pending && <span className="text-[11px] text-muted">Отправляем…</span>}
        </div>
      ) : (
        <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
          <p
            className={`max-w-[80%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm ${
              mine
                ? "rounded-br-lg bg-foreground text-background"
                : "rounded-bl-lg bg-surface-card text-foreground"
            } ${m.pending ? "opacity-60" : ""}`}
          >
            {m.text}
            <span
              className={`mt-1 block text-right text-[11px] ${
                mine ? "text-background/60" : "text-muted"
              }`}
            >
              {timeLabel(m.createdAt)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
