import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // поиск и служебные маршруты — дубли с параметрами, в индексе не нужны
      disallow: [
        "/search",
        "/api/",
        "/login",
        "/signup",
        "/pin/new",
        // лента по категории переехала на /category/<slug>; старый query-путь
        // остаётся работающим для уже разосланных ссылок, но не индексируется
        "/?category=",
        "/?feed=",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
