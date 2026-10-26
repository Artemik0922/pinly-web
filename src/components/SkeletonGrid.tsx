// Скелетоны карточек на время первой загрузки ленты.

const HEIGHTS = [300, 420, 260, 380, 340, 460, 280, 400, 320, 360, 300, 430, 270, 390, 330, 350];

export function SkeletonGrid({ count = 15 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl bg-surface"
          style={{ height: HEIGHTS[i % HEIGHTS.length] }}
        />
      ))}
    </div>
  );
}
