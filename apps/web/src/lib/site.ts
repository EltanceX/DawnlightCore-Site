export const siteConfig = {
  name: "DawnlightCore",
  description: "面向 Survivalcraft Dawnlight 光影开发者的文档与发布门户。",
  canonicalOrigin: "https://dawnlightcore.example.invalid",
  defaultLocale: "zh-CN",
  defaultDocsVersion: "preview",
  docsVersions: [
    {
      id: "preview",
      label: "Preview",
      status: "preview" as const,
      coreVersion: "3ec28fc",
    },
  ],
} as const;

export const supportedLocales = [siteConfig.defaultLocale] as const;

export function isSupportedLocale(
  value: string,
): value is (typeof supportedLocales)[number] {
  return supportedLocales.includes(value as (typeof supportedLocales)[number]);
}

export function isDocsVersion(value: string): boolean {
  return siteConfig.docsVersions.some((version) => version.id === value);
}
