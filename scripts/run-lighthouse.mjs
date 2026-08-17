import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeLighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import * as chromeLauncher from "chrome-launcher";
import { chromium } from "@playwright/test";

const config = JSON.parse(
  readFileSync(resolve("config/lighthouse-budgets.json"), "utf8"),
);
const baseURL = process.env.LIGHTHOUSE_BASE_URL ?? "http://127.0.0.1:4174";
const production = process.env.NEXT_PUBLIC_SITE_MODE === "production";
const thresholds = production
  ? config.thresholds
  : { ...config.thresholds, ...config.previewThresholds };
const chromeCandidates = [
  process.env.CHROME_PATH,
  chromium.executablePath(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromePath) {
  throw new Error(
    "No Chrome/Chromium executable found. Run `pnpm exec playwright install chromium` or set CHROME_PATH.",
  );
}

const chrome = await chromeLauncher.launch({
  chromePath,
  chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
});
const reportRoot = resolve("reports/lighthouse");
mkdirSync(reportRoot, { recursive: true });
const summaries = [];

try {
  for (const route of config.routes) {
    const url = new URL(route, baseURL).toString();
    const result = await AxeLighthouse(
      url,
      {
        port: chrome.port,
        logLevel: "error",
        output: "json",
        onlyCategories: Object.keys(thresholds),
      },
      desktopConfig,
    );
    if (!result) throw new Error(`Lighthouse returned no result for ${url}`);

    const scores = Object.fromEntries(
      Object.keys(thresholds).map((category) => [
        category,
        result.lhr.categories[category]?.score ?? 0,
      ]),
    );
    const slug =
      route === "/zh-CN/" ? "home" : route.split("/").filter(Boolean).at(-1);
    writeFileSync(resolve(reportRoot, `${slug}.json`), result.report);
    summaries.push({ route, scores });
  }
} finally {
  try {
    await chrome.kill();
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    console.warn(
      "Chrome exited, but Windows retained a temporary Lighthouse profile; continuing with the completed reports.",
    );
  }
}

const violations = summaries.flatMap(({ route, scores }) =>
  Object.entries(thresholds)
    .filter(([category, threshold]) => scores[category] < threshold)
    .map(
      ([category, threshold]) =>
        `${route} ${category} ${scores[category].toFixed(2)} < ${threshold.toFixed(2)}`,
    ),
);
const summary = {
  schemaVersion: 1,
  baseURL,
  production,
  thresholds,
  previewSeoException: production ? undefined : config.previewSeoException,
  routes: summaries,
  violations,
};
writeFileSync(
  resolve(reportRoot, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

if (violations.length > 0) {
  console.error(`Lighthouse budget failed:\n${violations.join("\n")}`);
  process.exit(1);
}

console.log(
  `Lighthouse budgets passed for ${summaries.length} routes (${production ? "production" : "preview"} mode).`,
);
