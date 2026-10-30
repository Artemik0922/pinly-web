"use client";

// Комментарии к пину: список, форма для вошедших, удаление своего
// (любого — если пин ваш).

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiAddComment, apiComments, apiDeleteComment, type Comment } from "@/lib/account";
import { useUser } from "@/lib/user";
import { countLabel } from "@/lib/plural";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { IconTrash } from "@/components/Icons";

export function Comments({ pinId, pinOwnerId }: { pinId: string; pinOwnerId?: string }) {
  const { user, enabled } = useUser();
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await apiComments(pinId));
    } catch {
      // бэкенд аккаунтов недоступен — комментариев не показываем
    }
  }, [pinId]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    apiComments(pinId, controller.signal)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pinId]);

  if (!enabled || !loaded) return null;

  const post = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiAddComment(pinId, clean);
      setText("");
      await reload();
    } catch {
      setError("Не удалось отправить комментарий.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    post();
  };

  const remove = async (commentId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiDeleteComment(commentId);
      await reload();
    } catch {
      setError("Не удалось удалить комментарий.");
    } finally {
      setBusy(false);
    }
  };

  const canDelete = (comment: Comment) =>
    !!user && (comment.author.id === user.id || user.id === pinOwnerId);

  const viewerName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Я";

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">
        {items.length > 0
          ? countLabel(items.length, "комментарий", "комментария", "комментариев")
          : "Комментарии"}
      </h2>

      <ul className="mt-4 space-y-4">
        {items.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            <Avatar name={comment.author.name} url={comment.author.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <Link
                  href={`/profile/${comment.author.id}`}
                  className="font-semibold hover:text-accent-strong"
                >
                  {comment.author.name}
                </Link>
                <span className="ml-2 text-xs text-muted">{timeAgo(comment.createdAt)}</span>
              </p>
              <p className="mt-1 text-sm break-words">{comment.text}</p>
            </div>
            {canDelete(comment) && (
              <button
                type="button"
                onClick={() => remove(comment.id)}
                disabled={busy}
                aria-label="Удалить комментарий"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50 sm:h-8 sm:w-8"
              >
                <IconTrash size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {user ? (
        <form onSubmit={submit} className="mt-5 flex gap-3">
          <Avatar name={viewerName} url={user.user_metadata?.avatar_url ?? null} size={36} />
          <div className="min-w-0 flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post();
              }}
              placeholder="Добавьте комментарий…"
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-2xl bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-40"
              >
                Отправить
              </button>
              <span className="text-xs text-muted">Ctrl+Enter — отправить</span>
              {error && <span role="alert" className="text-sm text-danger">{error}</span>}
            </div>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm text-muted">
          <Link href="/login" className="font-semibold text-accent-strong hover:underline">
            Войдите
          </Link>
          , чтобы оставить комментарий.
        </p>
      )}
    </section>
  );
}
