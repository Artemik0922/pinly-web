// Проводка запросов к RouterAI: один источник правды для сайта (TS) и
// индексатора (node-скрипт). Держится в .mjs без типов и алиасов, чтобы его
// можно было импортировать с обеих сторон без сборки.
//
// Формат запроса с КАРТИНКОЙ в публичной документации RouterAI не описан:
// страница voyage-multimodal-3.5 показывает только текстовый /embeddings.
// Поэтому вариантов три, они перебираются по очереди, а победитель
// запоминается (npm run probe:embeddings показывает, какой сработал).

/** Тело текстового запроса. dimensions часть провайдеров не принимает. */
export function textBody(model, input, dimensions, withDimensions) {
  return {
    model,
    input,
    encoding_format: "float",
    ...(withDimensions ? { dimensions } : {}),
  };
}

/**
 * Запросы с картинками в порядке правдоподобия:
 *  1. OpenAI-совместимый /embeddings с content-частями;
 *  2. /embeddings, куда data-URL передают как обычную строку input;
 *  3. voyage-native /multimodalembeddings (собственный формат Voyage).
 *
 * Порядок не с потолка: замер 2026-10-31 без ключа — RouterAI отвечает на
 * /multimodalembeddings «404 page not found», тогда как /embeddings жив
 * (401 со стандартным JSON). Значит собственные voyage-эндпоинты роутер не
 * проксирует, и вариант остаётся последним — на случай, если их откроют.
 */
export function imageRequests(model, urls, dimensions) {
  const content = urls.map((url) => [{ type: "image_url", image_url: { url } }]);
  return [
    {
      format: "openai-parts",
      path: "/embeddings",
      body: textBody(model, content, dimensions, true),
    },
    {
      format: "data-url",
      path: "/embeddings",
      body: textBody(model, urls, dimensions, true),
    },
    {
      format: "voyage-native",
      path: "/multimodalembeddings",
      body: {
        model,
        inputs: content.map((parts) => ({ content: parts })),
        input_type: "search_document",
        output_dimension: dimensions,
      },
    },
  ];
}

/** Ответ OpenAI-совместимого или voyage-совместимого эндпоинта. */
export function parseVectors(payload, expected, dimensions) {
  const data = payload?.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error("embeddings: пустой ответ");
  return data.slice(0, expected).map((item) => {
    if (!Array.isArray(item?.embedding)) throw new Error("embeddings: нет поля embedding");
    // Matryoshka: лишние измерения отрезаются, смысл остаётся в первых
    return item.embedding.slice(0, dimensions);
  });
}

/** data: URL для запроса с картинкой. */
export function toDataUrl(mime, bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${Buffer.from(binary, "binary").toString("base64")}`;
}
