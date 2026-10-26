// Конфигурация Supabase. Сервер не настроен (env пуст) — фичи авторизации
// тихо отключаются, сайт работает в анонимном режиме (localStorage).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseEnabled(): boolean {
  return SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
}
