import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("content/releases/releases.json");
const outputPath = resolve("apps/web/public/feeds/releases-v1.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const sorted = {
  ...source,
  releases: [...source.releases].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  ),
};

writeFileSync(outputPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
console.log(`Generated ${outputPath} (${sorted.releases.length} releases).`);
