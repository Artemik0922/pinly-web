import type { Metadata } from "next";
import type { ReactNode } from "react";

// Формы входа и регистрации не содержат контента для индекса.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
