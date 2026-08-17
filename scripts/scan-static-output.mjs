import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const outputRoot = resolve("apps/web/out");
const textExtensions = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".txt",
  ".xml",
]);
const findings = [];
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["API key", /(?<![A-Za-z])sk-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["local file URI", /file:\/\/(?:\/[A-Za-z]:\/|\/Users\/|\/home\/)/i],
  ["Windows user path", /[A-Za-z]:\\Users\\[^\\\s"']+/i],
  ["workspace path", /E:\\Projects\\webdev\\dawnlight-core/i],
  ["Core source path", /E:\\sc\\2\.4 Rebuild/i],
];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    const path = relative(outputRoot, absolute).replaceAll("\\", "/");
    if (extname(path).toLowerCase() === ".map") {
      findings.push(`${path}: public source map`);
      continue;
    }
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const content = readFileSync(absolute, "utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(content)) findings.push(`${path}: ${label}`);
    }
  }
}

walk(outputRoot);

if (findings.length > 0) {
  console.error(`Static output security scan failed:\n${findings.join("\n")}`);
  process.exit(1);
}

console.log("Static output security scan passed (no secrets or local paths).");
