import type { Metadata } from "next";
import type { ReactNode } from "react";

// Приватный раздел пользователя: заголовок свой, в индекс не попадает.
export const metadata: Metadata = {
  title: "Мои доски",
  robots: { index: false, follow: false },
};

export default function BoardsLayout({ children }: { children: ReactNode }) {
  return children;
}
