"use client";

// Профиль пользователя: имя, email, свои доски.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { useUser } from "@/lib/user";
import { useBoards } from "@/lib/store";
import { pinCountLabel } from "@/lib/plural";
import { IconCompass } from "@/components/Icons";

type Profile = { display_name: string; avatar_url: string | null };

export function ProfileView({ id }: { id: string }) {
  const { user, ready: userReady, enabled } = useUser();
  const { boards, ready: boardsReady } = useBoards();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !userReady) return;
    if (!user || user.id !== id) {
      setLoading(false);
      return;
    }
    getSupabase()!
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", id)
      .single()
      .then(({ data }: { data: Profile | null }) => {
        setProfile(data);
        setLoading(false);
      });
  }, [enabled, user, userReady, id]);

  const isOwn = user?.id === id;

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted/80">Загрузка…</p>;
  }

  if (!enabled) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconCompass size={40} />
        </p>
        <p className="mt-3 text-muted">
          Профили появятся после подключения сервера авторизации.
        </p>
      </div>
    );
  }

  if (!isOwn) {
    return (
      <div className="py-20 text-center">
        <p className="grid place-items-center text-muted">
          <IconCompass size={40} />
        </p>
        <p className="mt-3 text-muted">Профили других пользователей пока закрыты.</p>
      </div>
    );
  }

  const name = profile?.display_name ?? user?.email?.split("@")[0] ?? "Профиль";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-bold text-white">
          {name
            .split(/\s+/)
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">{name}</h1>
          <p className="text-sm text-muted/80">{user?.email}</p>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-bold">Мои доски</h2>
      {!boardsReady && <p className="py-8 text-center text-sm text-muted/80">Загрузка…</p>}
      {boardsReady && boards.length === 0 && (
        <p className="py-8 text-muted">
          Досок пока нет.{" "}
          <Link href="/boards" className="text-accent hover:underline">
            Создать первую
          </Link>
        </p>
      )}
      {boardsReady && boards.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/board/${board.id}`}
                className="block rounded-2xl bg-surface-card p-4 hover:bg-black/[0.06]"
              >
                <p className="truncate font-semibold">{board.title}</p>
                <p className="mt-1 text-sm text-muted/80">{pinCountLabel(board.pins.length)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
