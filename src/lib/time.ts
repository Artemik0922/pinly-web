// Относительное время для комментариев, досок и подписок: «5 минут назад».

import { countLabel } from "@/lib/plural";

const MINUTE = 60_000;

export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${countLabel(minutes, "минуту", "минуты", "минут")} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${countLabel(hours, "час", "часа", "часов")} назад`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${countLabel(days, "день", "дня", "дней")} назад`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${countLabel(months, "месяц", "месяца", "месяцев")} назад`;
  return `${countLabel(Math.floor(days / 365), "год", "года", "лет")} назад`;
}
