import Link from "next/link";
import type { CSSProperties } from "react";
import { IconPin, IconSearch } from "@/components/ui/Icons";

// 404 конкретного пина (notFound() в /pin/[id]): пин удалён или ссылка
// битая. Рамка-лоза: стебель обходит контур пустой рамки, листья
// раскрываются наружу (CSS из globals.css). Серверный компонент.

function Leaf({
  x,
  y,
  rotate,
  delay,
  dark = false,
}: {
  x: number;
  y: number;
  rotate: number;
  delay: string;
  dark?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      {/* fill обязателен: у svg стоит fill="none", без него лист невидим */}
      <path
        className="nf-leaf"
        style={{ "--delay": delay, transformOrigin: "50% 100%" } as CSSProperties}
        d="M0 0 C 1.5 -8, 8 -15, 19 -16 C 13.5 -8, 7 -3, 0 0 Z"
        fill={dark ? "var(--accent-strong)" : "var(--accent)"}
      />
    </g>
  );
}

// Гарланд: листья цепочкой вдоль стебля, кончиком по ходу ветки.
// Порядок — по часовой от верхнего левого угла, задержка растёт вместе
// с прорисовкой стебля (2.8 с).
const GARLAND: Array<[number, number, number, string]> = [
  [80, 8, 90, "0.7s"], // верхняя грань, кончик вправо
  [130, 8, 90, "1s"],
  [184, 52, 135, "1.3s"], // правый верхний скругление
  [192, 78, 180, "1.5s"], // правая грань, кончик вниз
  [184, 98, 225, "1.8s"], // правое нижнее скругление
  [130, 142, 270, "2s"], // нижняя грань, кончик влево
  [80, 142, 270, "2.2s"],
  [16, 98, 315, "2.4s"], // левое нижнее скругление
  [8, 78, 0, "2.6s"], // левая грань, кончик вверх
  [16, 52, 45, "2.8s"], // левое верхнее скругление
];

export default function PinNotFound() {
  return (
    <main className="mx-auto grid min-h-[calc(100dvh-9rem)] w-full max-w-shell-text place-items-center px-4 py-16 text-center">
      <div>
        <div className="relative mx-auto h-[150px] w-[200px]" aria-hidden>
          <svg
            viewBox="0 0 200 150"
            fill="none"
            className="absolute inset-0 h-full w-full text-accent-strong"
          >
            {/* стебель обходит рамку по кругу */}
            <path
              className="nf-draw"
              style={{ animationDuration: "2.8s" } as CSSProperties}
              d="M 60 8 H 140 C 172 8 192 28 192 60 V 90 C 192 122 172 142 140 142 H 60 C 28 142 8 122 8 90 V 60 C 8 28 28 8 60 8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
            />
            {GARLAND.map(([x, y, rotate, delay], i) => (
              <Leaf key={i} x={x} y={y} rotate={rotate} delay={delay} dark={i % 2 === 0} />
            ))}
          </svg>
          <span className="absolute inset-0 grid place-items-center text-muted">
            <IconPin size={44} />
          </span>
        </div>

        <h1 className="mt-8 text-2xl font-extrabold sm:text-3xl">Пин не найден</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Возможно, автор удалил его, а ссылка осталась из закладок. Похожие
          идеи точно есть в ленте.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90"
          >
            В ленту
          </Link>
          <Link
            href="/search"
            className="flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover"
          >
            <IconSearch size={15} />
            Поиск
          </Link>
        </div>
      </div>
    </main>
  );
}
