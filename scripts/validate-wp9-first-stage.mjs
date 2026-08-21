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
  "packages/database/scripts/smoke-release-staging.mjs",
  "scripts/run-wp9-a-release-drill.mjs",
  "docs/V2-WP9-3-Implementation.md",
  "docs/V2-FirstRealRelease-Gate.md",
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
  "update directory_projects set status = 'withdrawn'",
  "update directory_projects set status = 'taken-down'",
]) {
  if (!database.includes(marker)) fail(`data layer is missing ${marker}`);
}

if (!read("packages/database/src/search.ts").includes("v.id is not null")) {
  fail("search must not expose a project without an available version");
}

const publishing = read("packages/database/src/publishing.ts");
if (/\$1[^`]*;[^`]*\$1/s.test(publishing)) {
  fail(
    "publishing must not send parameterized multi-statement queries to PostgreSQL",
  );
}

const releaseFixture = read(
  "packages/database/scripts/smoke-release-staging.mjs",
);
for (const marker of [
  "prevalidated-wp9-a-fixture",
  "publish_job_outbox",
  "version.withdraw",
  "publication_backlog",
]) {
  if (!releaseFixture.includes(marker))
    fail(`release fixture is missing ${marker}`);
}

const drill = read("scripts/run-wp9-a-release-drill.mjs");
for (const marker of [
  "DISPOSABLE-STAGING",
  "complete publication",
  "ordinary withdrawal",
  "object storage readiness fault",
  "failed publication visibility rollback",
  "publication retry recovery",
  "candidateEvidence: false",
  'sourceTreeAttestation: "unverified-wp9-a-snapshot"',
]) {
  if (!drill.includes(marker)) fail(`release drill is missing ${marker}`);
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
  "WP9-3 first-stage definitions passed (publish, withdraw, rollback, storage fault recovery and evidence boundaries).",
);
