// Прокси картинок источников: скачивает оригинал с сервера (flickr,
// wikimedia и др. доступны напрямую) и стримит с дисковым кэшем.
//
// Публичный эндпоинт, поэтому три ограничителя: список хостов, проверка,
// что апстрим действительно отдаёт картинку, и потолок размера. Ограничения
// по IP здесь сознательно нет: у route-хендлера нет адреса клиента, а
// доверять X-Forwarded-For без своего прокси — значит ограничивать себя.
// Дорого стоит один раз на URL: дальше отвечает дисковый кэш.

import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { MAX_IMG_BYTES, imageHash, isAllowedImgHost, sniffImageType } from "@/lib/providers/proxy";

const CACHE_DIR = join(process.cwd(), ".cache", "img");
const TIMEOUT_MS = 20000;
const SWEEP_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
} as const;

let writesSinceSweep = 0;

class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function download(url: string): Promise<Buffer> {
  // redirect: "manual" — редирект мог бы увести на неразрешённый хост.
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new UpstreamError(502, "upstream redirect");
  if (!res.ok) throw new UpstreamError(502, `upstream ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!type.startsWith("image/")) throw new UpstreamError(502, "upstream is not an image");
  if (!res.body) throw new UpstreamError(502, "empty upstream body");

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMG_BYTES) {
      await reader.cancel();
      throw new UpstreamError(502, "image too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Картинки источника не удаляются из Openverse, поэтому кэш может расти
// бесконечно: раз в 100 скачиваний убираем то, чем не пользовались месяц.
async function sweepImages(): Promise<void> {
  const cutoff = Date.now() - SWEEP_TTL_MS;
  const { readdir } = await import("node:fs/promises");
  for (const name of await readdir(CACHE_DIR)) {
    if (!name.endsWith(".bin")) continue;
    const path = join(CACHE_DIR, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(path).catch(() => undefined);
  }
}

async function cachedImage(url: string): Promise<{ data: Buffer; digest: string }> {
  const digest = imageHash(url);
  const file = join(CACHE_DIR, `${digest}.bin`);
  const hit = await readFile(file).catch(() => null);
  if (hit) return { data: hit, digest };

  const data = await download(url);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, data);
    if (++writesSinceSweep >= 100) {
      writesSinceSweep = 0;
      sweepImages().catch(() => undefined);
    }
  } catch {
    // кэш недоступен — просто отдаём
  }
  return { data, digest };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url || !/^https:\/\//.test(url)) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (!isAllowedImgHost(host)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  let image: { data: Buffer; digest: string };
  try {
    image = await cachedImage(url);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "fetch failed" }, { status: 504 });
  }

  // Тип по сигнатуре байтов: кэш хранит .bin без заголовков апстрима,
  // а врать про image/jpeg для PNG — путь к странным решениям браузера.
  const contentType = sniffImageType(image.data) ?? "image/jpeg";
  return new NextResponse(new Uint8Array(image.data), {
    headers: { "Content-Type": contentType, ...HEADERS },
  });
}
