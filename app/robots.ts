import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/desk", "/account", "/api/", "/auth/", "/checkout/", "/export/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
