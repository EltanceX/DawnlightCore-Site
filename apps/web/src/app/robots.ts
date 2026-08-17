import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const rules = siteConfig.previewMode
    ? { userAgent: "*", disallow: "/" }
    : { userAgent: "*", allow: "/" };

  return siteConfig.previewMode
    ? { rules }
    : { rules, sitemap: `${siteConfig.canonicalOrigin}/sitemap.xml` };
}
