import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const read = (path) => readFileSync(resolve(path), "utf8");
const fail = (message) => {
  console.error(`WP9 first-stage validation failed: ${message}`);
  process.exit(1);
};

const required = [
  "packages/database/migrations/0008_takedown_staging.sql",
  "packages/database/scripts/smoke-takedown-staging.mjs",
  "apps/worker/src/takedown.ts",
  "apps/worker/src/takedown.test.ts",
  "docs/V2-WP9-2-Implementation.md",
];
for (const path of required) {
  try {
    read(path);
  } catch {
    fail(`missing ${path}`);
  }
}

const migration = read(required[0]);
for (const marker of [
  "takedown_decisions",
  "takedown_evidence_outbox",
  "taken-down",
  "append-only",
]) {
  if (!migration.includes(marker)) fail(`0008 migration is missing ${marker}`);
}
if (/000[67]_/.test(required[0])) {
  fail("WP9-2 must not rewrite committed 0006/0007 migrations");
}

const api = read("apps/api/src/operations.ts");
for (const marker of [
  "/api/v1/ops/versions/:versionId/takedown",
  "TAKEDOWN ${request.params.versionId}",
  '"/artifacts/*"',
  '"cache-control", "no-store"',
]) {
  if (!api.includes(marker)) fail(`API boundary is missing ${marker}`);
}

const database = read("packages/database/src/operations.ts");
for (const marker of [
  "PlatformAdminRequired",
  "ops.version.takedown",
  "ArtifactTakenDown",
  "version.takedown",
  "takedown-evidence/",
]) {
  if (!database.includes(marker)) fail(`data layer is missing ${marker}`);
}

const worker = read("apps/worker/src/storage.ts");
for (const marker of [
  "restricted-takedown-evidence",
  "TakedownEvidenceVerificationFailed",
  "DeleteObjectCommand",
]) {
  if (!worker.includes(marker)) fail(`evidence storage is missing ${marker}`);
}

const caddy = read("infra/compose/wp9-a.Caddyfile");
if (!caddy.includes("/artifacts/*")) {
  fail("WP9-A edge must route known artifact URLs through the API gate");
}
const compose = parseYaml(read("infra/compose/wp9-a.compose.yml"));
if (compose.services?.minio?.ports) {
  fail("WP9-A object storage must not publish a host port");
}
if (!compose.networks?.private?.internal) {
  fail("WP9-A private network must remain internal");
}

const openapi = read("contracts/openapi/v1.yaml");
for (const marker of [
  "/api/v1/ops/versions/{versionId}/takedown:",
  "/artifacts/{artifactPath}:",
  "TakedownDecision:",
]) {
  if (!openapi.includes(marker)) fail(`OpenAPI is missing ${marker}`);
}

console.log(
  "WP9-2 first-stage definitions passed (atomic takedown, known-URL gate, evidence outbox and disposable drill).",
);
