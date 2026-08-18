import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("apps/web/out");
const required = [
  "index.html",
  "zh-CN/index.html",
  "zh-CN/docs/preview/index.html",
  "zh-CN/docs/preview/00-overview/introduction/index.html",
  "zh-CN/docs/preview/01-getting-started/first-minimal-pack/index.html",
  "zh-CN/docs/preview/06-reference/diagnostics/index.html",
  "zh-CN/downloads/index.html",
  "zh-CN/downloads/releases/index.html",
  "zh-CN/tools/index.html",
  "zh-CN/tools/diagnostics/index.html",
  "zh-CN/tools/catalog/index.html",
  "zh-CN/tools/capabilities/index.html",
  "zh-CN/tools/pipeline/index.html",
  "zh-CN/tools/variants/index.html",
  "zh-CN/tools/contract-diff/index.html",
  "zh-CN/shaders/index.html",
  "zh-CN/shaders/dawnlight-v3-1/index.html",
  "api/search",
  "feeds/releases-v1.json",
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
  ["UnknownIdentifier", "/zh-CN/docs/preview/06-reference/diagnostics"],
  ["schema-only", "/zh-CN/docs/preview/01-getting-started/validate-with-cli"],
  [
    "ShaderPackCli",
    "/zh-CN/docs/preview/01-getting-started/cli-installation-and-verification",
  ],
  ["JSON GLSL C#", "/zh-CN/docs/preview/00-overview/format-boundaries"],
  [
    "BuiltIn Minimal",
    "/zh-CN/docs/preview/02-concepts/builtin-minimal-vs-external-complete",
  ],
  ["history resource", "/zh-CN/docs/preview/05-guides/history-resource"],
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

const downloadsHtml = readFileSync(
  resolve(output, "zh-CN/downloads/index.html"),
  "utf8",
);
if (
  !downloadsHtml.includes("Preview feed") ||
  !downloadsHtml.includes("releases-v1.json")
) {
  console.error(
    "Static download output does not contain the preview feed state.",
  );
  process.exit(1);
}

const toolsHtml = readFileSync(
  resolve(output, "zh-CN/tools/index.html"),
  "utf8",
);
if (
  !toolsHtml.includes("Diagnostic Explorer") ||
  !toolsHtml.includes("Contract Diff") ||
  !toolsHtml.includes("只读 API")
) {
  console.error(
    "Static tools output does not contain the V2.0 preview boundary.",
  );
  process.exit(1);
}

const pipelineHtml = readFileSync(
  resolve(output, "zh-CN/tools/pipeline/index.html"),
  "utf8",
);
if (
  !pipelineHtml.includes("Graph unavailable") ||
  !pipelineHtml.includes("当前 contract 没有结构化 Graph dump")
) {
  console.error("Static Pipeline output hides the unavailable Graph boundary.");
  process.exit(1);
}

const variantsHtml = readFileSync(
  resolve(output, "zh-CN/tools/variants/index.html"),
  "utf8",
);
if (!variantsHtml.includes("Variant explain unavailable")) {
  console.error(
    "Static Variant output hides the unavailable explain boundary.",
  );
  process.exit(1);
}

const diffHtml = readFileSync(
  resolve(output, "zh-CN/tools/contract-diff/index.html"),
  "utf8",
);
if (!diffHtml.includes("两个 contract 没有结构差异")) {
  console.error(
    "Static Contract Diff output does not contain its empty state.",
  );
  process.exit(1);
}

const shadersHtml = readFileSync(
  resolve(output, "zh-CN/shaders/dawnlight-v3-1/index.html"),
  "utf8",
);
if (
  !shadersHtml.includes("schema-only") ||
  !shadersHtml.includes("当前不能下载")
) {
  console.error(
    "Static shader directory output does not contain the no-download state.",
  );
  process.exit(1);
}

const files = required.map((file) => statSync(resolve(output, file)).size);
console.log(
  `Static smoke passed (${files.reduce((total, size) => total + size, 0)} bytes across required files).`,
);
