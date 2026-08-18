import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const requiredFiles = [
  "apps/api/package.json",
  "apps/api/src/app.ts",
  "apps/api/src/contracts.ts",
  "apps/api/src/main.ts",
  "apps/api/tests/app.test.ts",
  "apps/worker/package.json",
  "apps/worker/src/queue.ts",
  "packages/config/src/env.ts",
  "packages/database/migrations/0001_runtime.sql",
  "packages/database/migrations/0002_contract_ingest.sql",
  "packages/database/migrations/0003_directory.sql",
  "packages/database/migrations/0004_authoring.sql",
  "packages/database/scripts/seed-directory.mjs",
  "packages/database/scripts/seed-authoring.mjs",
  "packages/api-client/src/index.ts",
  "packages/contract-data/src/index.ts",
  "packages/contract-data/src/node.ts",
  "contracts/dawnlight/preview/contract-manifest.json",
  "contracts/dawnlight/preview/contract-ingest-lock.json",
  "contracts/dawnlight/preview/ingest-fixture.json",
  "contracts/dawnlight/preview/directory-fixture.json",
  "contracts/openapi/v1.yaml",
  "infra/compose/v2-dev.compose.yml",
  "apps/web/src/components/developer-tools/tool-shared.tsx",
  "apps/web/src/components/developer-tools/diagnostic-explorer.tsx",
  "apps/web/src/components/developer-tools/catalog-explorer.tsx",
  "apps/web/src/components/developer-tools/capability-explorer.tsx",
  "apps/web/src/components/developer-tools/graph-explorer.tsx",
  "apps/web/src/components/developer-tools/variant-explorer.tsx",
  "apps/web/src/components/developer-tools/contract-diff-explorer.tsx",
  "apps/web/src/app/[locale]/tools/contract-diff/page.tsx",
  "apps/web/src/components/directory/directory-explorer.tsx",
  "apps/api/src/directory.ts",
  "apps/api/src/authoring.ts",
  "apps/api/src/oidc.ts",
  "apps/web/src/components/author/author-workspace.tsx",
  "apps/web/src/app/[locale]/author/page.tsx",
];

const missing = requiredFiles.filter((file) => !existsSync(resolve(file)));
if (missing.length > 0) {
  console.error(`V2 workspace is missing: ${missing.join(", ")}`);
  process.exit(1);
}

const workspace = readFileSync(resolve("pnpm-workspace.yaml"), "utf8");
for (const entry of ["  - apps/*", "  - packages/*"]) {
  if (!workspace.includes(entry)) {
    console.error(`pnpm workspace does not include ${entry.trim()}.`);
    process.exit(1);
  }
}

const compose = readFileSync(
  resolve("infra/compose/v2-dev.compose.yml"),
  "utf8",
);
const composeDocument = parseYaml(compose);
if (
  !composeDocument?.services?.postgres ||
  !composeDocument.services.minio ||
  !composeDocument.services.oidc
) {
  console.error(
    "V2 compose must define postgres, minio and test OIDC services.",
  );
  process.exit(1);
}
for (const service of ["postgres:", "minio:", "oidc:", "healthcheck:"]) {
  if (!compose.includes(service)) {
    console.error(`V2 compose is missing ${service}.`);
    process.exit(1);
  }
}

const openapi = parseYaml(
  readFileSync(resolve("contracts/openapi/v1.yaml"), "utf8"),
);
if (!openapi?.paths?.["/health/live"] || !openapi?.paths?.["/health/ready"]) {
  console.error(
    "V2 OpenAPI bootstrap must define live and ready health paths.",
  );
  process.exit(1);
}

const envExample = readFileSync(resolve(".env.example"), "utf8");
for (const key of [
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OTEL_SERVICE_NAME",
  "CONTRACT_DATA_SOURCE",
  "CONTRACT_FIXTURE_ROOT",
  "OIDC_ENABLED",
  "AUTH_COOKIE_SECRET",
]) {
  if (!envExample.includes(`${key}=`)) {
    console.error(`.env.example is missing ${key}.`);
    process.exit(1);
  }
}

console.log(
  "V2 workspace validation passed (WP1 skeleton, WP2 contract data, WP3 tools, WP4 directory, and WP5 authoring).",
);
