"use client";

// Кнопка «создать пин» — только для вошедших.

import Link from "next/link";
import { IconPlus } from "@/components/ui/Icons";
import { useUser } from "@/lib/state/session";

export function CreateButton() {
  const { user, ready, enabled } = useUser();
  if (!ready || !enabled || !user) return null;
  return (
    <Link
      href="/pin/new"
      aria-label="Создать пин"
      className="grid h-11 w-11 place-items-center rounded-full bg-foreground text-background hover:opacity-90"
    >
      <IconPlus size={18} />
    </Link>
  );
}
