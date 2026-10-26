"use client";

// Masonry-сетка как в Pinterest: CSS Grid с мелкой строкой (8px),
// каждая карточка занимает столько строк, сколько занимает по высоте.
// Замер — ResizeObserver, поэтому порядок ленты идёт слева направо,
// а не по колонкам, и всё живо реагирует на ширину экрана.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Pin } from "@/data/pins";
import { PinCard } from "@/components/PinCard";

const ROW = 8; // высота строки-единицы, px
const GAP = 16; // gap сетки, px

function MasonryItem({ children, estimate }: { children: ReactNode; estimate: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  // Начальная оценка по пропорции картинки — чтобы не было прыжка
  const [span, setSpan] = useState(() => Math.ceil((estimate + GAP) / (ROW + GAP)));

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setSpan(Math.max(1, Math.ceil((h + GAP) / (ROW + GAP))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ gridRowEnd: `span ${span}` }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

export function MasonryGrid({ pins }: { pins: Pin[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      style={{ gridAutoRows: `${ROW}px` }}
    >
      {pins.map((pin) => (
        <MasonryItem key={pin.id} estimate={(300 * pin.height) / pin.width}>
          <PinCard pin={pin} />
        </MasonryItem>
      ))}
    </div>
  );
}
