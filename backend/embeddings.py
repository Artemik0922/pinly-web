# Эмбеддинги google/gemini-embedding-2 (routerai.ru) и векторное хранилище.
#
# Конфиг должен совпадать с Node-версией (src/lib/providers/embeddings.ts,
# src/lib/vector-store.ts): векторы разных моделей несовместимы для
# cosine, хранилище различает их по version/dim. Env читается лениво —
# app.py подгружает .env.local уже после импортов.

import json
import math
import os
from pathlib import Path

import httpx

from backend.cache import CACHE_DIR, cached

STORE_PATH = CACHE_DIR / "vectors.json"
STORE_VERSION = 2
BATCH = 32
TIMEOUT_S = 30.0


def embed_base_url() -> str:
    return (
        os.environ.get("EMBED_BASE_URL")
        or os.environ.get("VOYAGE_BASE_URL")
        or "https://routerai.ru/api/v1"
    )


def embed_model() -> str:
    return os.environ.get("EMBED_MODEL", "google/gemini-embedding-2")


def embed_dimensions() -> int:
    return int(os.environ.get("EMBED_DIMENSIONS", "768"))


def embed_api_key() -> str:
    return os.environ.get("EMBED_API_KEY") or os.environ.get("VOYAGE_API_KEY", "")


def embeddings_enabled() -> bool:
    return bool(embed_api_key())


def fnv1a(text: str) -> str:
    h = 0x811C9DC5
    for ch in text.encode("utf-8"):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return base36(h)


def base36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        out = digits[n % 36] + out
        n //= 36
    return out or "0"


# --- векторное хранилище (.cache/vectors.json, общий с Node-версией) ---

class VectorStore:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def load(self) -> None:
        try:
            raw = json.loads(STORE_PATH.read_text(encoding="utf-8"))
            if raw.get("version") != STORE_VERSION or raw.get("dim") != embed_dimensions():
                self.items = []  # хранилище другой модели/размерности
            else:
                self.items = raw.get("items", [])
        except (OSError, ValueError):
            self.items = []

    def save(self) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        STORE_PATH.write_text(
            json.dumps(
                {"version": STORE_VERSION, "dim": embed_dimensions(), "items": self.items}
            ),
            encoding="utf-8",
        )

    def upsert(self, pin: dict, vector: list[float]) -> None:
        self.items = [it for it in self.items if it["pin"].get("id") != pin.get("id")]
        self.items.append({"pin": pin, "vector": vector})

    def remove(self, pin_id: str) -> None:
        self.items = [it for it in self.items if it["pin"].get("id") != pin_id]


store = VectorStore()


def search_vectors(vector: list[float], top_k: int, exclude_id: str | None = None):
    scored = []
    for it in store.items:
        pin = it["pin"]
        if pin.get("id") == exclude_id:
            continue
        scored.append((cosine(vector, it["vector"]), pin))
    scored.sort(key=lambda s: -s[0])
    return [{"score": sc, "pin": pin} for sc, pin in scored[:top_k]]


def cosine(a: list[float], b: list[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    return dot / denom if denom else 0.0


# --- эмбеддинги текстов (тот же ключ кэша, что у Node-версии) ---

async def embed_texts(texts: list[str]) -> list[list[float]] | None:
    if not embeddings_enabled():
        return None
    model, dimensions, base = embed_model(), embed_dimensions(), embed_base_url()
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        out: list[list[float] | None] = [None] * len(texts)
        for i in range(0, len(texts), BATCH):
            batch = texts[i:i + BATCH]
            # модель и размерность в ключе кэша: при смене модели старые
            # векторы из кэша не должны возвращаться
            key = f"emb-batch:{model}:{dimensions}:{fnv1a(chr(0).join(batch))}"

            async def call():
                async def do_request(with_dimensions: bool):
                    body = {"model": model, "input": batch, "encoding_format": "float"}
                    if with_dimensions:
                        body["dimensions"] = dimensions
                    return await client.post(
                        f"{base}/embeddings",
                        headers={"Authorization": f"Bearer {embed_api_key()}"},
                        json=body,
                    )

                res = await do_request(True)
                if res.status_code == 400:
                    # провайдер не знает dimensions — Matryoshka-трюк: режем сами
                    res = await do_request(False)
                res.raise_for_status()
                data = res.json()
                return [d["embedding"][:dimensions] for d in data["data"]]

            vectors = await cached(key, call)
            for j in range(len(batch)):
                out[i + j] = vectors[j]
    return out  # type: ignore[return-value]
