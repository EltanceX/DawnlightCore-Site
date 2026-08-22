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
    maximumAllowedFixableCritical: 0,
    manualReviewRequiredForUnfixedCritical: true,
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
  );
  const fixableCritical = critical.filter((vulnerability) =>
    vulnerability.FixedVersion?.trim(),
  ).length;
  const unfixedCritical = critical.length - fixableCritical;

  summary.images.push({
    component,
    high,
    critical: critical.length,
    fixableCritical,
    unfixedCritical,
  });
  console.log(
    `${component}: ${high} high, ${critical.length} critical (${fixableCritical} fixable, ${unfixedCritical} unfixed)`,
  );
}

const outputPath = resolve("reports/image-scans/summary.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

const fixableCriticalTotal = summary.images.reduce(
  (total, image) => total + image.fixableCritical,
  0,
);
const unfixedCriticalTotal = summary.images.reduce(
  (total, image) => total + image.unfixedCritical,
  0,
);
if (fixableCriticalTotal > summary.policy.maximumAllowedFixableCritical) {
  console.error(
    `Image vulnerability gate failed: ${fixableCriticalTotal} fixable critical vulnerabilities found.`,
  );
  process.exit(1);
}

console.log(
  `Image vulnerability gate passed (zero fixable critical vulnerabilities; ${unfixedCriticalTotal} unfixed critical findings require manual review).`,
);
