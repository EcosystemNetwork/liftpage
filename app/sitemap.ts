import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE}/`, changeFrequency: "monthly", priority: 1 }];
}
