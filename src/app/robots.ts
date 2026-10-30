import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // поиск и служебные маршруты — дубли с параметрами, в индексе не нужны
      disallow: ["/search", "/api/", "/login", "/signup", "/pin/new"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
