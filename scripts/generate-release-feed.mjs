import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "content/releases/releases.json");
const outputPath = resolve(root, "apps/web/public/feeds/releases-v1.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const sorted = {
  ...source,
  releases: [...source.releases].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  ),
};

writeFileSync(outputPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
console.log(`Generated ${outputPath} (${sorted.releases.length} releases).`);
