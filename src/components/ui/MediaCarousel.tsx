"use client";

// Перелистываемые носители пина: слайды и видео.
//
// Листание — нативный горизонтальный скролл со snap: палец, колесо, клавиатура
// и точки-индикаторы работают одним механизмом, без самописного drag'а,
// ResizeObserver'ов и анимаций на JS. Активный индекс читается из scrollLeft
// (rAF-троттлинг), кнопки лишь просят scrollTo.
//
// Высота коробки — пропорция обложки (width/height пина), а не активного
// слайда: иначе masonry перетекал бы на каждом листании, а картинка-кандидат
// в LCP уезжала бы по экрану. Слайды другой пропорции обрезаются в карточке и
// встают с полями на странице пина — резать работу мастера незачем.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMediaDuration, type PinSlide } from "@/lib/pin";
import { SlideImage } from "@/components/ui/SlideImage";
import { IconChevronLeft, IconChevronRight, IconPause, IconPlay } from "@/components/ui/Icons";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// Свайп внутри ссылки-карточки не должен превращаться в переход: после
// листания клик по карточке гасится на коротком окне.
const SWIPE_GUARD_MS = 300;

export function MediaCarousel({
  slides,
  alt,
  cover,
  variant = "card",
  sizes,
  priority = false,
  preload = false,
  rounded = "rounded-2xl",
  onSlideView,
  onError,
}: {
  slides: PinSlide[];
  alt: string;
  // пропорция обложки пина: [width, height]
  cover: [number, number];
  variant?: "card" | "detail";
  sizes?: string;
  priority?: boolean;
  preload?: boolean;
  rounded?: string;
  onSlideView?: (index: number, slide: PinSlide) => void;
  onError?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const lastSwipe = useRef(0);
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const multiple = slides.length > 1;

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next === index || next < 0 || next >= slides.length) return;
    lastSwipe.current = performance.now();
    setIndex(next);
    onSlideView?.(next, slides[next]);
  }, [index, onSlideView, slides]);

  // scroll приходит пачками: считаем индекс не чаще кадра
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !multiple) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [multiple, sync]);

  // Играет только активный слайд: иначе в ленте гремят все ролики сразу, и
  // каждый качает байты.
  useEffect(() => {
    videos.current.forEach((video, i) => {
      if (!video) return;
      if (i === index) {
        if (variant === "card") void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [index, variant, slides.length]);

  const goTo = (next: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    const reduce = window.matchMedia(REDUCED_MOTION).matches;
    el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  const markBroken = (i: number) => {
    setBroken((prev) => ({ ...prev, [i]: true }));
    onError?.();
  };

  return (
    <div
      className={`pin-skeleton relative overflow-hidden ${rounded}`}
      style={{ aspectRatio: `${cover[0]} / ${cover[1]}` }}
      {...(multiple
        ? {
            role: "group" as const,
            "aria-roledescription": "карусель",
            "aria-label": `Слайды: ${alt}`,
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                goTo(index + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                goTo(index - 1);
              }
            },
            // карточка пина — ссылка; свайп не должен в неё проваливаться.
            // Точки и стрелки при этом не трогаем: их клик — управление
            // каруселью, а не попытка открыть пин.
            onClickCapture: (e: React.MouseEvent) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest("button")) return;
              if (performance.now() - lastSwipe.current < SWIPE_GUARD_MS) {
                e.preventDefault();
                e.stopPropagation();
              }
            },
          }
        : {})}
    >
      {multiple ? (
        <div
          ref={trackRef}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto"
        >
          {slides.map((slide, i) => (
            <div
              key={`${slide.url}-${i}`}
              className="relative h-full w-full shrink-0 snap-center"
              aria-hidden={i !== index}
            >
              <Media
                slide={slide}
                alt={alt}
                sizes={sizes}
                priority={priority && i === 0}
                preload={preload && i === 0}
                variant={variant}
                broken={Boolean(broken[i])}
                onBroken={() => markBroken(i)}
                videoRef={(node) => {
                  videos.current[i] = node;
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <Media
          slide={slides[0]}
          alt={alt}
          sizes={sizes}
          priority={priority}
          preload={preload}
          variant={variant}
          broken={Boolean(broken[0])}
          onBroken={() => markBroken(0)}
          videoRef={(node) => {
            videos.current[0] = node;
          }}
        />
      )}

      {multiple && variant === "detail" && (
        <>
          <CarouselArrow side="prev" disabled={index === 0} onClick={() => goTo(index - 1)} />
          <CarouselArrow
            side="next"
            disabled={index === slides.length - 1}
            onClick={() => goTo(index + 1)}
          />
          <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
            {index + 1}/{slides.length}
          </p>
        </>
      )}

      {multiple && (
        <>
          {/* Точки: видимая часть — 6 px, зона нажатия — 44, как у всех кнопок
              интерфейса. Без них листание мышью неоткрываемо. Под точками
              лежит полупрозрачная пилюля: на светлой работе мастера белые
              точки сливались с фоном и индикатор исчезал. */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center">
            <div className="flex items-center rounded-full bg-black/35 px-0.5 py-1">
              {slides.map((slide, i) => (
                <button
                  key={`dot-${i}`}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goTo(i);
                  }}
                  aria-label={`Слайд ${i + 1} из ${slides.length}${slide.kind === "video" ? ", видео" : ""}`}
                  aria-current={i === index}
                  className="grid h-11 w-7 place-items-center"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-200 ease-pop ${
                      i === index ? "w-5 bg-white" : "w-1.5 bg-white/70"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            Слайд {index + 1} из {slides.length}
          </p>
        </>
      )}
    </div>
  );
}

function CarouselArrow({
  side,
  disabled,
  onClick,
}: {
  side: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={side === "prev" ? "Предыдущий слайд" : "Следующий слайд"}
      className={`absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-foreground shadow-card transition-opacity hover:bg-background disabled:opacity-0 ${
        side === "prev" ? "left-3" : "right-3"
      }`}
    >
      {side === "prev" ? <IconChevronLeft size={18} /> : <IconChevronRight size={18} />}
    </button>
  );
}

function Media({
  slide,
  alt,
  sizes,
  priority,
  preload,
  variant,
  broken,
  onBroken,
  videoRef,
}: {
  slide: PinSlide;
  alt: string;
  sizes?: string;
  priority?: boolean;
  preload?: boolean;
  variant: "card" | "detail";
  broken: boolean;
  onBroken: () => void;
  videoRef: (node: HTMLVideoElement | null) => void;
}) {
  const player = useRef<HTMLVideoElement | null>(null);
  // Пауза живёт в состоянии слайда, а источник истины — сами события <video>:
  // эффект карусели ставит паузу, когда слайд становится неактивным, и читалка
  // не должна показывать «Пауза» на уже остановленном ролике.
  const [paused, setPaused] = useState(false);
  const width = slide.width || 800;
  const height = slide.height || 1200;

  if (slide.kind === "image" || broken) {
    const src = slide.kind === "image" ? slide.url : slide.posterUrl;
    if (!src) return null;
    return (
      <>
        <SlideImage
          src={src}
          width={width}
          height={height}
          alt={broken ? `${alt} — кадр из видео` : alt}
          sizes={sizes}
          priority={priority}
          preload={preload}
          fit={variant === "detail" ? "contain" : "cover"}
          fill
          onError={onBroken}
        />
        {broken && (
          // битое видео показываем постером и честной подписью: пустая ячейка
          // выглядит как «загрузка сломалась», а не как «видео недоступно»
          <p className="absolute inset-x-3 bottom-12 rounded-full bg-black/60 px-3 py-1 text-center text-xs font-semibold text-white">
            Видео не воспроизводится в этом браузере
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <video
        ref={(node) => {
          player.current = node;
          videoRef(node);
        }}
        src={slide.url}
        poster={slide.posterUrl}
        // карточка: тихо и по кругу, как в ленте Pinterest; на странице пина
        // звук и перемотка принадлежат человеку, который открыл работу
        muted={variant === "card"}
        loop={variant === "card"}
        controls={variant === "detail"}
        playsInline
        preload={variant === "detail" ? "metadata" : "none"}
        aria-label={`Видео: ${alt}${slide.durationMs ? `, ${formatMediaDuration(slide.durationMs)}` : ""}`}
        onError={onBroken}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="h-full w-full bg-black object-cover"
      />
      {variant === "card" && (
        // Кнопка, а не тап по ролику: карточка целиком — ссылка на пин, и жест
        // «остановить видео» не имеет права с ней спорить.
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const video = player.current;
            if (!video) return;
            if (video.paused) void video.play().catch(() => undefined);
            else video.pause();
          }}
          aria-label={paused ? "Воспроизвести видео" : "Остановить видео"}
          className="absolute bottom-12 left-3 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
        </button>
      )}
      {variant === "card" && slide.durationMs ? (
        <p className="pointer-events-none absolute bottom-12 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
          <IconPlay size={10} />
          {formatMediaDuration(slide.durationMs)}
        </p>
      ) : null}
    </>
  );
}
