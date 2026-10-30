// Страница ленты для клиентской догрузки (инфинити-скролл).
// Cookie сессии уходит в getFeedPage: при ней первые ~80% страницы —
// персональная подборка по вектору вкуса.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getFeedPage } from "@/lib/feed";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const cursor = Number(searchParams.get("cursor") ?? "0") || 0;
  const session = req.cookies.get(SESSION_COOKIE)?.value ?? null;

  const page = await getFeedPage({ category, q, cursor, session });
  return NextResponse.json(page);
}
