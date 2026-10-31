// TheMealDB: фото готовых блюд для категории «Рецепты».

import { cached } from "@/lib/server/providers/cache";
import type { Pin } from "@/lib/pin";

// TheMealDB за Cloudflare: Node-клиенту сайт tarpit'ит TLS-рукопожатие
// (проверено 2026-10-30: curl и httpx проходят, Node висит), поэтому
// запросы блюд идут через Python-бэкенд (httpx, общий дисковый кэш
// .cache с теми же ключами). Бэкенд недоступен — вклад рецептов пустеет.
const MEAL_BACKEND = process.env.ACCOUNTS_BACKEND_URL ?? "http://127.0.0.1:8000";

async function mealApi<T>(path: string, key: string): Promise<T> {
  return cached<T>(key, async () => {
    const res = await fetch(`${MEAL_BACKEND}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`mealdb ${res.status}`);
    return (await res.json()) as T;
  });
}

// ── TheMealDB: фото готовых блюд для категории «Рецепты» ───────────────

type Meal = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
  strInstructions?: string;
  strArea?: string;
  strCategory?: string;
};

const MEAL_CATEGORIES = [
  "Dessert",
  "Seafood",
  "Chicken",
  "Beef",
  "Vegetarian",
  "Breakfast",
  "Pasta",
  "Side",
  "Starter",
  "Lamb",
];

export async function mealdbPins(page: number, count = 8): Promise<Pin[]> {
  try {
    const cat = MEAL_CATEGORIES[(page - 1) % MEAL_CATEGORIES.length];
    const list = await mealApi<{ meals?: Array<{ idMeal: string; strMeal: string; strMealThumb: string }> | null }>(
      `/api/mealdb/list?c=${encodeURIComponent(cat)}`,
      `meal-list:${cat}`,
    );
    const meals = list.meals ?? [];
    if (meals.length === 0) return [];
    const start = ((page - 1) * count) % Math.max(meals.length - count, 1);
    const pins = await Promise.all(
      meals.slice(start, start + count).map(async (m): Promise<Pin> => {
        // детали блюд — тоже через Python-прокси: Cloudflare tarpit'ит
        // TLS-рукопожатие Node-клиента (замер 2026-10-31: прямой fetch из
        // Node падает через ~11 с), а список уже ходит через бэкенд
        const detail = await mealApi<{ meals?: Meal[] | null }>(
          `/api/mealdb/lookup?i=${encodeURIComponent(m.idMeal)}`,
          `meal:${m.idMeal}`,
        );
        const meal = detail.meals?.[0];
        return mealPinFrom(m, meal);
      }),
    );
    return pins;
  } catch {
    return [];
  }
}

function mealPinFrom(
  m: { idMeal: string; strMeal: string; strMealThumb: string },
  meal?: Meal,
): Pin {
  return {
    id: `meal-${m.idMeal}`,
    title: m.strMeal.slice(0, 120),
    description: (meal?.strInstructions || "").slice(0, 240),
    category: "Рецепты",
    tags: [meal?.strArea, meal?.strCategory].filter((t): t is string => Boolean(t)).slice(0, 3),
    author: "TheMealDB",
    width: 800,
    height: 800,
    seed: m.idMeal,
    likes: 0,
    sourceUrl: m.strMealThumb,
    pageUrl: `https://www.themealdb.com/meal/${m.idMeal}`,
    provider: "themealdb",
  };
}

// Деталь по id: lookup отдаёт блюдо целиком, включая картинку.
export async function getMealPin(id: string): Promise<Pin | undefined> {
  try {
    const detail = await mealApi<{ meals?: Meal[] | null }>(
      `/api/mealdb/lookup?i=${encodeURIComponent(id)}`,
      `meal:${id}`,
    );
    const meal = detail.meals?.[0];
    if (!meal) return undefined;
    return mealPinFrom(meal, meal);
  } catch {
    return undefined;
  }
}
