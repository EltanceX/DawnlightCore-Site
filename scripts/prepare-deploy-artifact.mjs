import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--")) {
    const next = process.argv[index + 1];
    args.set(value.slice(2), next?.startsWith("--") ? true : (next ?? true));
  }
}

const mode = args.get("mode") ?? "preview";
if (!new Set(["preview", "production"]).has(mode)) {
  throw new Error(`Unsupported deploy mode: ${mode}`);
}

const outputRoot = resolve("apps/web/out");
const siteMode = process.env.NEXT_PUBLIC_SITE_MODE ?? "preview";
const siteOrigin =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  "https://dawnlightcore.example.invalid";
const provider = process.env.DEPLOY_PROVIDER;
const feed = JSON.parse(
  readFileSync(resolve("content/releases/releases.json"), "utf8"),
);
const assetMetadata = parseYaml(
  readFileSync(resolve("assets/media/source/hero/asset-metadata.yml"), "utf8"),
);
const gates = [];

if (mode === "production") {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(siteOrigin);
  } catch {
    gates.push("NEXT_PUBLIC_SITE_ORIGIN must be a valid URL");
  }
  if (
    parsedOrigin &&
    (parsedOrigin.protocol !== "https:" ||
      parsedOrigin.hostname.endsWith(".invalid"))
  ) {
    gates.push("production origin must use HTTPS and a non-.invalid host");
  }
  if (siteMode !== "production")
    gates.push("NEXT_PUBLIC_SITE_MODE must be production");
  if (!provider) gates.push("DEPLOY_PROVIDER must be explicit");
  if (
    !process.env.PRODUCTION_DOCS_VERSION ||
    process.env.PRODUCTION_DOCS_VERSION === "preview"
  ) {
    gates.push("PRODUCTION_DOCS_VERSION must name a non-preview docs release");
  }
  if (!feed.releases.some((release) => release.status === "available")) {
    gates.push("release feed must contain at least one available release");
  }
  if (assetMetadata.productionEligible !== true) {
    gates.push("Hero asset metadata must set productionEligible: true");
  }
}

if (gates.length > 0) {
  console.error(`Deployment gate failed:\n${gates.join("\n")}`);
  process.exit(1);
}

if (args.has("validate-only")) {
  console.log(`Deployment configuration passed for ${mode} mode.`);
  process.exit(0);
}

if (!existsSync(resolve(outputRoot, "index.html"))) {
  throw new Error("Static output is missing; run `pnpm build` first.");
}

const headersSource = resolve(`deploy/headers/${mode}._headers`);
copyFileSync(headersSource, resolve(outputRoot, "_headers"));

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.name !== "deploy-manifest.json") {
      const buffer = readFileSync(absolute);
      files.push({
        path: relative(outputRoot, absolute).replaceAll("\\", "/"),
        bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      });
    }
  }
}
walk(outputRoot);
files.sort((a, b) => a.path.localeCompare(b.path));

const commit =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : feed.generatedAt;
const manifest = {
  schemaVersion: 1,
  artifactId: `dawnlight-core-${commit}`,
  commit,
  mode,
  provider: provider ?? "unselected",
  siteOrigin,
  generatedAt,
  fileCount: files.length,
  files,
  rollback: {
    strategy: "switch-to-previous-complete-artifact",
    partialOverwriteAllowed: false,
  },
};
writeFileSync(
  resolve(outputRoot, "deploy-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
mkdirSync(resolve("reports"), { recursive: true });
writeFileSync(
  resolve("reports/deploy-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `Prepared ${manifest.artifactId} (${files.length} files, ${mode} mode).`,
);
