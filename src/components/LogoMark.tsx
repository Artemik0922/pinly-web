// Монохромный знак Pinly: диск, сквозь который проходит литера P.
//
// Геометрию поставляет scripts/make-logo.py — руками здесь не правим, иначе
// favicon и шапка разъедутся. Цвет currentColor: в светлой теме это
// --foreground (почти чёрный), в тёмной — почти белый; второй картинки нет,
// и при переключении темы знак не мигает.
//
// Дыра в диске и выходящий хвост сделаны масками, а не одним path: evenodd
// вырезал бы союз штока и чашки с дырой на их пересечении.

import { useId } from "react";

const LETTER = "M35.24,23.2 H42.43999999999999 A2.52,2.52 0 0,1 44.959999999999994,25.72 V79.72 A2.52,2.52 0 0,1 42.43999999999999,82.24 H35.24 A2.52,2.52 0 0,1 32.72,79.72 V25.72 A2.52,2.52 0 0,1 35.24,23.2 Z M39.2,23.2 H52.879999999999995 A17.28,17.28 0 0,1 52.879999999999995,57.76 H39.2 Z M43.519999999999996,49.839999999999996 V31.119999999999997 H51.44 A9.36,9.36 0 0,0 51.44,49.839999999999996 Z";
const R_DISC = 36;
const GAP = 2.1;

export function LogoMark({ className = "" }: { className?: string }) {
  // id маски обязан быть уникальным: два знака на одной странице (шапка и
  // подвал) с общим id подменяют маску друг у друга
  const uid = useId();
  const discMask = `disc${uid}`;
  const tailMask = `tail${uid}`;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <defs>
        <mask id={discMask}>
          <circle cx="50" cy="50" r={R_DISC} fill="#fff" />
          <path d={LETTER} fill="#000" fillRule="nonzero" />
        </mask>
        <mask id={tailMask}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="50" cy="50" r={R_DISC + GAP} fill="#000" />
        </mask>
      </defs>
      <circle
        cx="50"
        cy="50"
        r={R_DISC}
        fill="currentColor"
        mask={`url(#${discMask})`}
      />
      <path
        d={LETTER}
        fill="currentColor"
        fillRule="nonzero"
        mask={`url(#${tailMask})`}
      />
    </svg>
  );
}
