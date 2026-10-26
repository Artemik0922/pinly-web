import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BoardsProvider } from "@/lib/store";
import { UserProvider } from "@/lib/user";
import { Header } from "@/components/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pinly — находите и сохраняйте идеи",
  description:
    "Визуальная лента идей: интерьер, рецепты, путешествия и многое другое. Сохраняйте понравившееся на доски.",
};

// suppressHydrationWarning на <html>: инлайн-скрипт темы ставит data-theme
// до гидрации — это ожидаемое расхождение, не баг.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Тема до первой отрисовки: сохранённая или системная — без мигания */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pinly:theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <UserProvider>
          <BoardsProvider>
            <Header />
            <main className="pb-16">{children}</main>
          </BoardsProvider>
        </UserProvider>
      </body>
    </html>
  );
}
