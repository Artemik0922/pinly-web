import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { BoardsProvider } from "@/lib/store";
import { LikesProvider } from "@/lib/likes";
import { UserProvider } from "@/lib/user";
import { ToastProvider } from "@/components/Toast";
import { Header } from "@/components/Header";
import { Splash } from "@/components/Splash";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Pinly — находите и сохраняйте идеи",
    template: "%s — Pinly",
  },
  description:
    "Визуальная лента идей: интерьер, рецепты, путешествия и многое другое. Сохраняйте понравившееся на доски.",
  openGraph: {
    type: "website",
    siteName: "Pinly",
    locale: "ru_RU",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: "Pinly", creator: "@pinly" },
  robots: { index: true, follow: true },
  // Знак монохромный, а favicon не умеет читать data-theme сайта: вкладки
  // переключаются по системной теме (media), а сам интерфейс — по нашей.
  icons: {
    icon: [
      { url: "/icons/icon-light.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: light)" },
      { url: "/icons/icon-dark.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/icons/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
};

// suppressHydrationWarning на <html>: инлайн-скрипт темы ставит data-theme
// до гидрации — это ожидаемое расхождение, не баг.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Тема до первой отрисовки: сохранённая или системная — без мигания */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pinly:theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`,
          }}
        />
        {/* Стартовый экран, две фазы: когда документ загружен и шрифты готовы
            (но не раньше 3 с) — "burst", из заставки вылетает рой летучих
            мышей и она
            ещё держится 1.8 с; затем "hidden" — заставка тает. Максимум 5 с
            до "burst" — медленная сеть не запирает сайт. Если скрипт упал,
            data-splash остаётся неустановленным и экран не показывается
            вовсе (см. .splash в globals.css). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;d.dataset.splash="on";var t0=Date.now(),done=false;function hide(){if(done)return;done=true;var wait=Math.max(0,3000-(Date.now()-t0));setTimeout(function(){d.dataset.splash="burst";setTimeout(function(){d.dataset.splash="hidden";},1800);},wait);}var pending=2;function step(){if(--pending===0)hide();}if(document.readyState==="complete")step();else addEventListener("load",step,{once:true});if(document.fonts&&document.fonts.ready)document.fonts.ready.then(step);else step();setTimeout(hide,5000);}catch(e){try{document.documentElement.dataset.splash="hidden";}catch(_){}}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <Splash />
        <ToastProvider>
          <UserProvider>
            <BoardsProvider>
              <LikesProvider>
                <Header />
                <a
                  href="#content"
                  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background"
                >
                  Перейти к содержимому
                </a>
                <main id="content" className="pb-16">
                  {children}
                </main>
              </LikesProvider>
            </BoardsProvider>
          </UserProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
