// Чтение web/.env.local для node-скриптов: Next подхватывает его сам, а
// scripts/*.mjs — нет, без этого `npm run index` требовал бы export в шелле.
// Экспортируется только то, чего ещё нет в process.env: переменная шелла
// важнее файла.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FILES = [".env.local", ".env"];

export async function loadEnv(root = process.cwd()) {
  for (const name of FILES) {
    let text;
    try {
      text = await readFile(join(root, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      const value = rawValue.trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value !== "") process.env[key] = value;
    }
  }
  return process.env;
}

export function apiKey(env = process.env) {
  return env.EMBED_API_KEY ?? env.VOYAGE_API_KEY ?? "";
}
