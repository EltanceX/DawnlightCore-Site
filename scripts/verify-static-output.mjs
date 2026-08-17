import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("apps/web/out");
const required = [
  "index.html",
  "zh-CN/index.html",
  "zh-CN/docs/preview/index.html",
  "zh-CN/downloads/index.html",
  "api/search",
];

const missing = required.filter((file) => !existsSync(resolve(output, file)));
if (missing.length > 0) {
  console.error(`Missing static output: ${missing.join(", ")}`);
  process.exit(1);
}

const searchIndex = readFileSync(resolve(output, "api/search"), "utf8");
if (!searchIndex.includes("/zh-CN/docs/preview")) {
  console.error("Static search index does not contain the preview docs route.");
  process.exit(1);
}

const searchRegression = [
  ["设置菜单", "/zh-CN/docs/preview/pipeline/overview"],
  ["drawbuffers", "/zh-CN/docs/preview/pipeline/overview"],
  ["historyCommit", "/zh-CN/docs/preview/pipeline/overview"],
  ["P9UI203", "/zh-CN/docs/preview/pipeline/overview"],
];
for (const [term, route] of searchRegression) {
  if (!searchIndex.includes(term) || !searchIndex.includes(route)) {
    console.error(`Static search regression failed for ${term}.`);
    process.exit(1);
  }
}

const docsHtml = readFileSync(
  resolve(output, "zh-CN/docs/preview/index.html"),
  "utf8",
);
if (
  !docsHtml.includes("examples/minimal/shaderpack.json") ||
  !docsHtml.includes("3ec28fc9") ||
  !docsHtml.includes("Preview 合同")
) {
  console.error(
    "Static docs output does not contain the verified contract example metadata.",
  );
  process.exit(1);
}

const files = required.map((file) => statSync(resolve(output, file)).size);
console.log(
  `Static smoke passed (${files.reduce((total, size) => total + size, 0)} bytes across required files).`,
);
