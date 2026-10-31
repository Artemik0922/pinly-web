// Знак Pinly — стеклянная литера P (public/logo-mark.png, фон прозрачный).
// Получен из 3D-рендера: заливка фона от краёв кадра убрала белый фон и тень,
// не тронув блики внутри стекла.
//
// Раньше здесь был SVG на currentColor (светлая/тёмная темы). У растровой
// версии темы не нужно: светлое стекло читается и на белом, и на тёмном
// фоне. Держим рядом favicon (src/app/favicon.ico) из того же файла.

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- маленькая статичная иконка: оптимизатор next/image не нужен
    <img src="/logo-mark.png" alt="" className={className} draggable={false} />
  );
}
