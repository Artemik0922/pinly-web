// Скелетоны карточек на время первой загрузки ленты.
//
// Раскладка повторяет MasonryGrid (CSS-колонки, те же gap и отступы), иначе
// при появлении настоящих пинов сетка пересобирается и контент дёргается.

const HEIGHTS = [300, 420, 260, 380, 340, 460, 280, 400, 320, 360, 300, 430, 270, 390, 330, 350];

export function SkeletonGrid({ count = 15 }: { count?: number }) {
  return (
    <div
      className="columns-2 gap-4 [column-fill:_balance] sm:columns-3 lg:columns-4 xl:columns-5"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse mb-4 break-inside-avoid rounded-2xl bg-surface"
          style={{ height: HEIGHTS[i % HEIGHTS.length] }}
        />
      ))}
    </div>
  );
}
