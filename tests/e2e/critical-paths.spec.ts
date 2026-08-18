import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("homepage exposes static developer and download paths", async ({
  page,
}, testInfo) => {
  await page.goto("/zh-CN/");

  await expect(
    page.getByRole("heading", { level: 1, name: "DawnlightCore" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "开始阅读文档" }),
  ).toHaveAttribute("href", "/zh-CN/docs/preview/");
  await expect(page.getByRole("link", { name: "查看下载" })).toHaveAttribute(
    "href",
    "/zh-CN/downloads/",
  );
  await expect(page.getByText("非 Dawnlight 实机截图")).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    statusTop: document
      .querySelector(".dl-home__status")
      ?.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.statusTop).toBeLessThan(layout.viewportHeight);

  await testInfo.attach(`home-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("documentation search opens the CLI validation page", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.startsWith("mobile"),
    "Desktop search path is covered once.",
  );
  await page.goto("/zh-CN/docs/preview/");
  await page.locator("[data-search-full]").click();
  const search = page.getByRole("dialog").getByRole("textbox");
  await search.fill("schema-only");
  const result = page.getByText("使用 CLI 验证", { exact: true }).first();
  await expect(result).toBeVisible({ timeout: 10000 });
  await result.click();
  await expect(page).toHaveURL(/\/01-getting-started\/validate-with-cli\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "使用 CLI 验证" }),
  ).toBeVisible();
});

test("download page preserves the verified empty-feed state", async ({
  page,
}) => {
  await page.goto("/zh-CN/downloads/?platform=invalid&architecture=invalid");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Preview feed 尚无可下载 artifact",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("页面不会展示未经核对的下载链接。", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator("a[href^='http']").filter({ hasText: /下载/ }),
  ).toHaveCount(0);
});

test("V2 tools and shader directory expose verified preview boundaries", async ({
  page,
}) => {
  await page.goto("/zh-CN/tools/");
  await expect(
    page.getByRole("heading", { level: 1, name: "开发工具" }),
  ).toBeVisible();
  await expect(
    page.getByText("preview-2026-08-16", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Diagnostic Explorer/ }),
  ).toHaveAttribute("href", "/zh-CN/tools/diagnostics/");

  await page.goto("/zh-CN/tools/diagnostics/UnknownIdentifier/");
  await expect(
    page.getByRole("heading", { level: 1, name: "UnknownIdentifier" }),
  ).toBeVisible();
  await expect(
    page.getByText("不虚构具体文件路径", { exact: false }),
  ).toBeVisible();

  await page.goto("/zh-CN/shaders/");
  await expect(
    page.getByRole("heading", { level: 1, name: "光影目录" }),
  ).toBeVisible();
  await expect(page.getByText("Dawnlight v3.1", { exact: true })).toBeVisible();
  await expect(page.getByText("暂无下载", { exact: true })).toBeVisible();

  await page.goto("/zh-CN/shaders/dawnlight-v3-1/");
  await expect(page.getByText("当前不能下载", { exact: true })).toBeVisible();
  await expect(page.getByText("schema-only", { exact: true })).toBeVisible();
  await expect(
    page.locator("a[href^='http']").filter({ hasText: /下载/ }),
  ).toHaveCount(0);
});

test("theme selection survives a reload", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name.startsWith("mobile"),
    "Mobile theme control is inside the menu.",
  );
  await page.goto("/zh-CN/");
  const toggle = page.getByRole("button", { name: "Toggle Theme" });
  const before = await page.locator("html").getAttribute("class");
  await toggle.click();
  await expect
    .poll(() => page.locator("html").getAttribute("class"))
    .not.toBe(before);
  const selected = await page.locator("html").getAttribute("class");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("class", selected ?? "");
});

test("404 page provides recovery navigation", async ({ page }) => {
  const response = await page.goto("/zh-CN/does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "没有找到这个页面" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute(
    "href",
    "/zh-CN/",
  );
  await expect(page.getByRole("link", { name: "浏览文档" })).toHaveAttribute(
    "href",
    "/zh-CN/docs/preview/",
  );
});

for (const route of [
  "/zh-CN/",
  "/zh-CN/docs/preview/",
  "/zh-CN/downloads/",
  "/zh-CN/tools/",
  "/zh-CN/tools/catalog/",
  "/zh-CN/tools/diagnostics/UnknownIdentifier/",
  "/zh-CN/shaders/",
  "/zh-CN/shaders/dawnlight-v3-1/",
  "/zh-CN/does-not-exist/",
]) {
  test(`axe has no serious or critical violations on ${route}`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.addStyleTag({
      content:
        "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
