import Link from "next/link";
import type { CSSProperties } from "react";
import { IconSearch } from "@/components/ui/Icons";

// 404 для несуществующих адресов. «Ноль» — лавровый венок: тонкий эллипс
// в пропорции цифры, поверх него две ветки листьев идут снизу вверх навстречу
// друг другу, листья лежат вдоль ветки и к верху крупнее (CSS из globals.css,
// одноразовая анимация). Серверный компонент без клиентского скрипта.

// Гладкий лист: крепится основанием (0,0), кончик вверх, лёгкая асимметрия.
const LEAF = "M0 0 C 1.5 -8, 8 -15, 19 -16 C 13.5 -8, 7 -3, 0 0 Z";

const RX = 32; // эллипс «нуля»
const RY = 41;

type Placed = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  flip: boolean;
  delay: string;
  dark: boolean;
};

// Позиция листа на эллипсе: кончик смотрит по ходу ветки (кассательная).
// Ветки не смыкаются на 12 часах — сверху зазор, как у классического лавра.
function branchLeaves(): Placed[] {
  const out: Placed[] = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0 — низ венка, 1 — верх
    const scale = 0.75 + 0.35 * t;
    const delay = (0.35 + t).toFixed(2);
    // правая ветка: θ от +88° (низ) до -76° (чуть не доходя верха)
    {
      const deg = ((88 - t * 164) * Math.PI) / 180;
      const x = 50 + RX * Math.cos(deg);
      const y = 50 + RY * Math.sin(deg);
      const ang = (Math.atan2(-RY * Math.cos(deg), RX * Math.sin(deg)) * 180) / Math.PI;
      out.push({ x, y, rotate: ang + 90, scale, flip: i % 2 === 1, delay, dark: i % 2 === 0 });
    }
    // левая ветка: θ от +92° (низ) до +256° (чуть не доходя верха)
    {
      const deg = ((92 + t * 164) * Math.PI) / 180;
      const x = 50 + RX * Math.cos(deg);
      const y = 50 + RY * Math.sin(deg);
      const ang = (Math.atan2(RY * Math.cos(deg), -RX * Math.sin(deg)) * 180) / Math.PI;
      out.push({ x, y, rotate: ang + 90, scale, flip: i % 2 === 0, delay, dark: i % 2 === 1 });
    }
  }
  return out;
}

const LEAVES = branchLeaves();

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-9rem)] w-full max-w-2xl place-items-center px-4 py-16 text-center">
      <div>
        <p className="sr-only">Ошибка 404</p>
        <div
          aria-hidden
          className="flex select-none items-center justify-center text-[5.5rem] font-extrabold leading-none tracking-tighter sm:text-[8rem]"
        >
          <span>4</span>
          <svg
            viewBox="0 0 100 100"
            fill="none"
            className="mx-[0.04em] h-[0.74em] w-[0.74em] overflow-visible"
          >
            {/* кольцо «нуля» рисуется первым, ветки догоняют его снизу */}
            <ellipse
              cx="50"
              cy="50"
              rx={RX}
              ry={RY}
              stroke="currentColor"
              strokeWidth="4.5"
              pathLength={1}
              className="nf-draw"
              style={{ animationDuration: "1s" } as CSSProperties}
            />
            {LEAVES.map((leaf, i) => (
              <g
                key={i}
                transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.rotate.toFixed(1)}) scale(${leaf.flip ? -leaf.scale : leaf.scale} ${leaf.scale})`}
              >
                <path
                  d={LEAF}
                  fill={leaf.dark ? "var(--accent-strong)" : "var(--accent)"}
                  className="nf-leaf"
                  style={
                    {
                      "--delay": `${leaf.delay}s`,
                      transformOrigin: "50% 100%",
                    } as CSSProperties
                  }
                />
              </g>
            ))}
          </svg>
          <span>4</span>
        </div>

        <h1 className="mt-8 text-2xl font-extrabold">Такой страницы нет</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Возможно, она переехала или её никогда не существовало. Идеи —
          в ленте.
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
            className="flex items-center gap-1.5 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover"
          >
            <IconSearch size={15} />
            Поиск
          </Link>
        </div>
      </div>
    </main>
  );
}
