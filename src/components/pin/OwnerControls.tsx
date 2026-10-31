"use client";

// Контролы владельца своего пина: редактирование и удаление. Чужому
// пользователю и гостю здесь ничего не показываем — право судится по pin.userId.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Pin } from "@/lib/pin";
import { CATEGORIES } from "@/data/mock-pins";
import { apiDeletePin, apiUpdatePin } from "@/lib/api/pins";
import { useUser } from "@/lib/state/session";
import { ConfirmDialog } from "@/components/ui/Confirm";
import { IconPencil, IconTrash } from "@/components/ui/Icons";

const FIELD =
  "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";
const ICON_BUTTON =
  "grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-surface-hover sm:h-9 sm:w-9";

export function OwnerControls({ pin }: { pin: Pin }) {
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

  const patch = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

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
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Название"
          maxLength={120}
          className={`${FIELD} font-semibold`}
        />
        <textarea
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          placeholder="Описание"
          rows={3}
          maxLength={2000}
          className={`${FIELD} resize-none`}
        />
        <div className="flex gap-2">
          <select
            value={form.category}
            onChange={(e) => patch("category", e.target.value)}
            className={`${FIELD} flex-1`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={form.tags}
            onChange={(e) => patch("tags", e.target.value)}
            placeholder="теги, через запятую"
            className={`${FIELD} flex-[2]`}
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
          className={ICON_BUTTON}
        >
          <IconPencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Удалить пин"
          className={`${ICON_BUTTON} disabled:opacity-50`}
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
