// Страница ленты для клиентской догрузки (инфинити-скролл).

import { NextRequest, NextResponse } from "next/server";
import { getFeedPage } from "@/lib/feed";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const cursor = Number(searchParams.get("cursor") ?? "0") || 0;

  const page = await getFeedPage({ category, q, cursor });
  return NextResponse.json(page);
}
