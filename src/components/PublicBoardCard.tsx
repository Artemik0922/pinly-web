"use client";

// Превью чужой доски: коллаж из трёх пинов + название. Используется на
// публичном профиле и во вкладке «Подписки».

import Link from "next/link";
import type { PublicBoard } from "@/lib/account";
import { pinCountLabel, boardPinCount } from "@/lib/plural";
import { IconPin } from "@/components/Icons";
import { PinImage } from "@/components/PinCard";

export function PublicBoardCard({ board }: { board: PublicBoard }) {
  const preview = board.pins.slice(0, 3);
  return (
    <li>
      <Link
        href={`/board/${board.id}`}
        className="block rounded-2xl bg-surface-card p-4 hover:bg-surface-hover"
      >
        <div className="flex aspect-[3/2] w-full overflow-hidden rounded-xl bg-surface">
          {preview.length === 0 ? (
            <div className="grid w-full place-items-center text-muted">
              <IconPin size={28} />
            </div>
          ) : (
            <div className="flex w-full">
              {preview.map((pin) => (
                <PinImage
                  key={pin.id}
                  pin={pin}
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 28vw, 18vw"
                  className="aspect-square w-1/3 rounded-none object-cover"
                />
              ))}
              {preview.length < 3 &&
                Array.from({ length: 3 - preview.length }).map((_, i) => (
                  <div key={i} className="aspect-square w-1/3 bg-surface" />
                ))}
            </div>
          )}
        </div>
        <p className="mt-2 truncate font-semibold">{board.title}</p>
        <p className="text-sm text-muted">{pinCountLabel(boardPinCount(board))}</p>
      </Link>
    </li>
  );
}
