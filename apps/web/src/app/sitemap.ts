import type { MetadataRoute } from "next";
import { releaseFeed } from "@/lib/releases";
import { siteConfig } from "@/lib/site";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (siteConfig.previewMode) return [];

  const baseRoutes = [
    "/",
    "/zh-CN/",
    "/zh-CN/downloads/",
    "/zh-CN/downloads/releases/",
    "/zh-CN/tools/",
    "/zh-CN/tools/diagnostics/",
    "/zh-CN/tools/catalog/",
    "/zh-CN/tools/capabilities/",
    "/zh-CN/tools/pipeline/",
    "/zh-CN/tools/variants/",
    "/zh-CN/tools/contract-diff/",
    "/zh-CN/shaders/",
  ];
  const docsRoutes = source.getPages().map((page) => `${page.url}/`);
  const routes = [...new Set([...baseRoutes, ...docsRoutes])];

  return routes.map((route) => ({
    url: new URL(route, siteConfig.canonicalOrigin).toString(),
    lastModified: new Date(releaseFeed.generatedAt),
    changeFrequency: route.includes("/docs/") ? "weekly" : "daily",
    priority: route === "/zh-CN/" ? 1 : route.includes("/docs/") ? 0.8 : 0.7,
  }));
}
