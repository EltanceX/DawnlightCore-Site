import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const reports = [
  ["web", "reports/image-scans/web.json"],
  ["api", "reports/image-scans/api.json"],
  ["worker", "reports/image-scans/worker.json"],
];

const summary = {
  schemaVersion: 1,
  policy: {
    reportedSeverities: ["HIGH", "CRITICAL"],
    maximumAllowedCritical: 0,
  },
  images: [],
};

for (const [component, path] of reports) {
  const document = JSON.parse(readFileSync(resolve(path), "utf8"));
  const vulnerabilities = (document.Results ?? []).flatMap(
    (result) => result.Vulnerabilities ?? [],
  );
  const high = vulnerabilities.filter(
    (vulnerability) => vulnerability.Severity === "HIGH",
  ).length;
  const critical = vulnerabilities.filter(
    (vulnerability) => vulnerability.Severity === "CRITICAL",
  ).length;

  summary.images.push({ component, high, critical });
  console.log(`${component}: ${high} high, ${critical} critical`);
}

const outputPath = resolve("reports/image-scans/summary.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

const criticalTotal = summary.images.reduce(
  (total, image) => total + image.critical,
  0,
);
if (criticalTotal > summary.policy.maximumAllowedCritical) {
  console.error(
    `Image vulnerability gate failed: ${criticalTotal} critical vulnerabilities found.`,
  );
  process.exit(1);
}

console.log("Image vulnerability gate passed (zero critical vulnerabilities).");
