import { describe, expect, it } from "vitest";
import { isDocsVersion, isSupportedLocale, siteConfig } from "@/lib/site";

describe("site configuration", () => {
  it("exposes a preview docs version and the first locale", () => {
    expect(siteConfig.defaultDocsVersion).toBe("preview");
    expect(isSupportedLocale("zh-CN")).toBe(true);
    expect(isDocsVersion("preview")).toBe(true);
  });

  it("rejects unknown route dimensions", () => {
    expect(isSupportedLocale("en-US")).toBe(false);
    expect(isDocsVersion("stable")).toBe(false);
  });
});
