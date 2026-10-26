"use client";

// Браузерный клиент Supabase. Создаётся лениво — без env-конфига вернёт null.

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseEnabled } from "@/lib/supabase/config";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!supabaseEnabled()) return null;
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
