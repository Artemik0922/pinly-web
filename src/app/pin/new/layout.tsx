import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Новый пин", robots: { index: false, follow: false } };

export default function NewPinLayout({ children }: { children: ReactNode }) {
  return children;
}
