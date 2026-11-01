import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Сообщения",
  robots: { index: false, follow: false },
};

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return children;
}
