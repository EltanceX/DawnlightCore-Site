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
  "packages/database/migrations/0005_upload_preflight.sql",
  "packages/database/migrations/0006_loader_review_publish.sql",
  "packages/database/migrations/0007_search_operations.sql",
  "packages/database/scripts/seed-directory.mjs",
  "packages/database/scripts/seed-authoring.mjs",
  "packages/database/scripts/smoke-search-operations.mjs",
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
  "apps/api/src/storage.ts",
  "apps/api/src/queue.ts",
  "apps/worker/src/preflight.ts",
  "apps/worker/src/storage.ts",
  "apps/worker/src/preflight.test.ts",
  "apps/worker/src/validator.ts",
  "apps/worker/src/validator.test.ts",
  "apps/worker/src/publication.ts",
  "apps/worker/src/publication.test.ts",
  "packages/database/src/publishing.ts",
  "packages/database/src/directory.ts",
  "packages/database/src/search.ts",
  "packages/database/src/operations.ts",
  "apps/api/src/search.ts",
  "apps/api/src/operations.ts",
  "apps/api/src/guards.ts",
  "apps/web/src/components/operations/operations-console.tsx",
  "apps/web/src/app/[locale]/ops/page.tsx",
  "infra/validator/Dockerfile",
  "infra/validator/Dockerfile.prepublished",
  "infra/validator/README.md",
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
  !composeDocument.services["minio-init"] ||
  !composeDocument.services.oidc
) {
  console.error(
    "V2 compose must define postgres, minio and test OIDC services.",
  );
  process.exit(1);
}
for (const service of [
  "postgres:",
  "minio:",
  "minio-init:",
  "oidc:",
  "healthcheck:",
]) {
  if (!compose.includes(service)) {
    console.error(`V2 compose is missing ${service}.`);
    process.exit(1);
  }
}

const openapi = parseYaml(
  readFileSync(resolve("contracts/openapi/v1.yaml"), "utf8"),
);
if (
  !openapi?.paths?.["/health/live"] ||
  !openapi?.paths?.["/health/ready"] ||
  !openapi?.paths?.["/api/v1/author/uploads/{uploadId}/complete"] ||
  !openapi?.paths?.[
    "/api/v1/author/projects/{projectId}/versions/{versionId}/submit"
  ] ||
  !openapi?.paths?.["/api/v1/reviewer/submissions/{submissionId}/decision"] ||
  !openapi?.paths?.["/api/v1/search"] ||
  !openapi?.paths?.["/api/v1/downloads/artifacts/{artifactId}"] ||
  !openapi?.paths?.["/api/v1/reports"] ||
  !openapi?.paths?.["/api/v1/ops/overview"] ||
  !openapi?.paths?.["/api/v1/ops/reports/{reportId}/resolve"] ||
  !openapi?.paths?.["/api/v1/ops/versions/{versionId}/withdraw"] ||
  !openapi?.paths?.["/api/v1/ops/projects/{projectId}/moderate"]
) {
  console.error(
    "V2 OpenAPI must define health, authoring, review, search and operations paths.",
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
  "UPLOAD_MAX_BYTES",
  "PREFLIGHT_MAX_EXTRACTED_BYTES",
  "PREFLIGHT_RETRY_LIMIT",
  "LOADER_VALIDATOR_ENABLED",
  "LOADER_CORE_COMMIT",
  "PUBLISHED_PUBLIC_BASE_URL",
  "RELEASE_FEED_SIGNING_KEY_ID",
  "PUBLICATION_RETRY_LIMIT",
  "PUBLICATION_TIMEOUT_SECONDS",
  "RATE_LIMIT_SEARCH_PER_MINUTE",
  "RATE_LIMIT_DOWNLOAD_PER_MINUTE",
  "RATE_LIMIT_UPLOAD_PER_MINUTE",
  "RATE_LIMIT_LOGIN_PER_TEN_MINUTES",
  "RATE_LIMIT_REPORT_PER_HOUR",
  "DOWNLOAD_EVENT_RETENTION_DAYS",
]) {
  if (!envExample.includes(`${key}=`)) {
    console.error(`.env.example is missing ${key}.`);
    process.exit(1);
  }
}

const validatorDockerfile = readFileSync(
  resolve("infra/validator/Dockerfile"),
  "utf8",
);
for (const boundary of [
  "USER 65532:65532",
  'ENTRYPOINT ["dotnet", "/validator/shaderpack.dll"]',
]) {
  if (!validatorDockerfile.includes(boundary)) {
    console.error(`Validator image is missing boundary: ${boundary}`);
    process.exit(1);
  }
}

console.log(
  "V2 workspace validation passed through WP8 (public search, coarse download analytics and private operations).",
);
