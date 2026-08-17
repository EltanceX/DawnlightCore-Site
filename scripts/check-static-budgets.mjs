import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const outputRoot = resolve("apps/web/out");
const config = JSON.parse(
  readFileSync(resolve("config/static-budgets.json"), "utf8"),
);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else
      files.push({
        path: relative(outputRoot, absolute).replaceAll("\\", "/"),
        bytes: entry.isFile() ? readFileSync(absolute).byteLength : 0,
      });
  }
}

walk(outputRoot);

const violations = [];
const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
if (totalBytes > config.totalBytes) {
  violations.push(`total output ${totalBytes} > ${config.totalBytes}`);
}

for (const file of files) {
  const extension = extname(file.path).toLowerCase();
  let limit;
  if (file.path === "api/search") limit = config.limits.searchIndexBytes;
  else if (extension === ".js") limit = config.limits.javascriptChunkBytes;
  else if (extension === ".css") limit = config.limits.stylesheetBytes;
  else if (extension === ".html") limit = config.limits.htmlDocumentBytes;
  else if (extension === ".webp") limit = config.limits.webpImageBytes;
  else if (extension === ".jpg" || extension === ".jpeg")
    limit = config.limits.jpegImageBytes;
  else if (extension === ".png") limit = config.limits.pngImageBytes;

  if (limit && file.bytes > limit) {
    violations.push(`${file.path} ${file.bytes} > ${limit}`);
  }
}

const report = {
  schemaVersion: 1,
  totalBytes,
  limits: config,
  largestFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 20),
  violations,
};
mkdirSync(resolve("reports"), { recursive: true });
writeFileSync(
  resolve("reports/static-budget.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (violations.length > 0) {
  console.error(`Static budget failed:\n${violations.join("\n")}`);
  process.exit(1);
}

console.log(
  `Static budget passed (${files.length} files, ${totalBytes} bytes total).`,
);
