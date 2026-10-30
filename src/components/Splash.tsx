"use client";

// Стартовый экран на время первой загрузки: документ и шрифты приезжают под
// непрозрачной заставкой, поэтому страница не «собирается на глазах».
// Фазами управляет инлайн-скрипт в layout.tsx через data-splash на <html>:
// "on" — заставка видна, логотип пульсирует; "burst" — из неё вылетает рой
// летучих мышей, заставка ещё держится; "hidden" — заставка тает. Без JS сайт заперт
// не будет: экран просто остаётся скрытым (виден при "on" и "burst").

import { useEffect, useState, type CSSProperties } from "react";
import { LogoMark } from "@/components/LogoMark";
import { IconBat } from "@/components/Icons";

type Bat = { angle: number; dist: number; size: number; delay: number };

function makeSwarm(): Bat[] {
  const count = 11;
  return Array.from({ length: count }, (_, i) => ({
    angle: (i * 360) / count + (Math.random() * 28 - 14),
    dist: 220 + Math.random() * 220,
    size: 28 + Math.random() * 20,
    delay: Math.random() * 160,
  }));
}

export function Splash() {
  const [bats, setBats] = useState<Bat[] | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    // Гидрация может случиться позже, чем скрипт успеет сменить фазу
    // (быстрый load при медленной гидрации) — тогда рой выпускаем сразу.
    if (root.dataset.splash === "burst" || root.dataset.splash === "hidden") {
      const timer = setTimeout(() => setBats(makeSwarm()), 0);
      return () => clearTimeout(timer);
    }
    const observer = new MutationObserver(() => {
      if (root.dataset.splash === "burst" || root.dataset.splash === "hidden") {
        observer.disconnect();
        setBats(makeSwarm());
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-splash"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bats) return;
    // самый долгий полёт: задержка до 160 мс + 1.6 с анимации, с запасом
    const timer = setTimeout(() => setBats(null), 2800);
    return () => clearTimeout(timer);
  }, [bats]);

  return (
    <>
      <div className="splash" aria-hidden="true">
        <span className="splash-badge">
          <LogoMark className="splash-logo" />
        </span>
        <span className="splash-word">Pinly</span>
      </div>
      {bats && (
        <div className="bats-burst" aria-hidden="true">
          {bats.map((m, i) => (
            <span
              key={i}
              className="bat-fly"
              style={
                {
                  "--angle": `${m.angle}deg`,
                  "--dist": `${m.dist}px`,
                  "--size": `${m.size}px`,
                  "--delay": `${m.delay}ms`,
                } as CSSProperties
              }
            >
              <IconBat className="bat-icon" />
            </span>
          ))}
        </div>
      )}
    </>
  );
}
