import type { Metadata } from "next";
import type { ReactNode } from "react";

// Приватный раздел: заголовок свой, в индекс не попадает — без сессии там
// «Войдите», а с сессией наружу попали бы чужие данные.
export const metadata: Metadata = {
  title: "Медиатека",
  robots: { index: false, follow: false },
};

export default function MediaLayout({ children }: { children: ReactNode }) {
  return children;
}
