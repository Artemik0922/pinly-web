import type { Metadata } from "next";
import type { ReactNode } from "react";

// Поиск — дубли с параметрами, в индексе не нужен; заголовок всё равно свой,
// иначе вкладка и снипет показывают общий заголовок сайта.
export const metadata: Metadata = {
  title: "Поиск",
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: ReactNode }) {
  return children;
}
