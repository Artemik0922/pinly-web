// Русская плюрализация для счётчика пинов: 1 пин, 2 пина, 5 пинов.

export function pinCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "пин"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "пина"
        : "пинов";
  return `${n} ${word}`;
}
