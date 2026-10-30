// Русская плюрализация для счётчиков: 1 пин, 2 пина, 5 пинов.

export function countLabel(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${n} ${word}`;
}

export function pinCountLabel(n: number): string {
  return countLabel(n, "пин", "пина", "пинов");
}

// Список досок отдаёт срез пинов (BOARD_PREVIEW_PINS в backend/accounts.py),
// поэтому число для подписи берём из счётчика, а не из длины среза.
export function boardPinCount(board: { pins: unknown[]; pinsCount?: number }): number {
  return board.pinsCount ?? board.pins.length;
}
