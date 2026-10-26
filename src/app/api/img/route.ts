// Прокси картинок источников: скачивает оригинал с сервера (flickr,
// wikimedia и др. доступны напрямую) и стримит с дисковым кэшем.

import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageHash } from "@/lib/providers/proxy";

const CACHE_DIR = join(process.cwd(), ".cache", "img");
const TIMEOUT_MS = 20000;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url || !/^https:\/\//.test(url)) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  // Только проверенные хосты источников изображений.
  const host = new URL(url).host;
  if (!/(staticflickr\.com|wikimedia\.org|flickr\.com)$/.test(host)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const file = join(CACHE_DIR, `${imageHash(url)}.bin`);
  let data: Buffer | null = null;
  let contentType = "image/jpeg";

  try {
    data = await readFile(file);
  } catch {
    // не в кэше — скачаем ниже
  }

  if (!data) {
    try {
      // redirect: "manual" — редирект мог бы увести на неразрешённый хост.
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        return NextResponse.json({ error: "upstream redirect" }, { status: 502 });
      }
      if (!res.ok) {
        return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 });
      }
      contentType = res.headers.get("content-type") ?? contentType;
      const buf = Buffer.from(await res.arrayBuffer());
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, buf);
      } catch {
        // кэш недоступен — просто отдаём
      }
      data = buf;
    } catch {
      return NextResponse.json({ error: "fetch failed" }, { status: 504 });
    }
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
