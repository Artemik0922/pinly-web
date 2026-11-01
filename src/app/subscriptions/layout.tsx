import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Подписки",
  robots: { index: false, follow: false },
};

export default function SubscriptionsLayout({ children }: { children: ReactNode }) {
  return children;
}
