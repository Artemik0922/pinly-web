"use client";

// Callback после OAuth-провайдера (Yandex ID и др.): обмен кода на сессию.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth
      .exchangeCodeForSession(window.location.href)
      .then(() => {
        router.replace("/");
        router.refresh();
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return <p className="py-20 text-center text-sm text-gray-400">Завершаем вход…</p>;
}
