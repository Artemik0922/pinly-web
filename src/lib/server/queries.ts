// Поисковые запросы к Openverse для каждой категории ленты.
// Страницы ленты циклически обходят запросы категории — контент
// разнообразный, а каждый запрос кэшируется отдельно.

export const CATEGORY_QUERIES: Record<string, string[]> = {
  Интерьер: ["cozy interior design", "scandinavian living room", "wooden kitchen interior"],
  Рецепты: ["homemade food plating", "pasta dish", "baking bread"],
  Путешествия: ["mountain landscape travel", "old town europe street", "sea coast village"],
  Мода: ["street style fashion", "autumn outfit", "minimal fashion look"],
  Искусство: ["watercolor painting", "linocut print", "sketchbook art"],
  Природа: ["foggy forest", "mountain lake sunrise", "flower field"],
  Архитектура: ["brutalist architecture", "modern villa", "staircase architecture"],
  Рукоделие: ["knitting wool", "ceramics handmade pottery", "macrame"],
  Фитнес: ["yoga pose", "outdoor running trail", "gym workout"],
  "Книги и рабочее место": ["reading nook books", "home library shelf", "desk workspace"],
};

// Общая ротация для ленты без категории.
export const ALL_QUERIES: string[] = Object.values(CATEGORY_QUERIES).flat();

export function queriesFor(category?: string): string[] {
  if (!category) return ALL_QUERIES;
  return CATEGORY_QUERIES[category] ?? [category];
}
