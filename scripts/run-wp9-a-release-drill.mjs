import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith("--"))
    args.set(value.slice(2), process.argv[index + 1]);
}
const required = (name) => {
  const value = args.get(name);
  if (typeof value !== "string" || !value)
    throw new Error(`Missing --${name}.`);
  return value;
};
if (required("confirm") !== "DISPOSABLE-STAGING") {
  throw new Error(
    "Pass --confirm DISPOSABLE-STAGING to run the destructive fault drill.",
  );
}

const composeFile = resolve(
  args.get("compose-file") ?? "infra/compose/wp9-a.compose.yml",
);
const envFile = resolve(args.get("env-file") ?? "infra/compose/wp9-a.env");
const reportFile = resolve(
  args.get("report") ?? "reports/wp9-a-release-drill.json",
);
if (basename(composeFile) !== "wp9-a.compose.yml") {
  throw new Error("The automated drill is restricted to wp9-a.compose.yml.");
}
const composeSource = readFileSync(composeFile, "utf8");
if (
  !composeSource.includes("name: dawnlight-wp9-a") ||
  !composeSource.includes("mock-oauth2-server")
) {
  throw new Error("The target is not the disposable WP9-A topology.");
}
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const publicOrigin = new URL(env.WP9_PUBLIC_ORIGIN).origin;
const runId = `${new Date().toISOString().slice(0, 10)}-${randomBytes(5).toString("hex")}`;
const fixtureBytes = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64");
const sha256 = createHash("sha256").update(fixtureBytes).digest("hex");
const common = ["compose", "--env-file", envFile, "-f", composeFile];
const report = {
  schemaVersion: 1,
  environment: "wp9-a-disposable",
  evidenceClass: "engineering-only",
  candidateEvidence: false,
  validatorMode: "prevalidated-fixture",
  runId,
  sourceRevision: env.WP9_IMAGE_REVISION ?? "unknown",
  sourceTreeAttestation: "unverified-wp9-a-snapshot",
  startedAt: new Date().toISOString(),
  checks: [],
  limitations: [
    "No real Loader or trusted Validator image was used.",
    "Local Compose edge has no CDN cache; purge/deny remains a WP9-B gate.",
    "The generated test images are not Registry digest release candidates.",
  ],
};

function docker(arguments_, options = {}) {
  return execFileSync("docker", [...common, ...arguments_], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function drillEnv(fixture) {
  return [
    "-e",
    "WP9_A_DRILL_CONFIRM=DISPOSABLE-STAGING",
    "-e",
    `WP9_A_DRILL_RUN_ID=${runId}`,
    "-e",
    `WP9_A_DRILL_FIXTURE=${fixture}`,
    "-e",
    `WP9_A_DRILL_SHA256=${sha256}`,
    "-e",
    `WP9_A_DRILL_SIZE=${fixtureBytes.length}`,
    "-e",
    `WP9_A_DRILL_PUBLIC_ORIGIN=${publicOrigin}`,
  ];
}

function database(action, fixture) {
  const output = docker([
    "exec",
    "-T",
    ...drillEnv(fixture),
    "api",
    "node",
    "/opt/dawnlight/database/scripts/smoke-release-staging.mjs",
    action,
  ]);
  const marker = output
    .split(/\r?\n/)
    .find((line) => line.startsWith("WP9_A_DRILL_JSON="));
  if (!marker)
    throw new Error(`Database drill did not return state:\n${output}`);
  return JSON.parse(marker.slice("WP9_A_DRILL_JSON=".length));
}

function upload(objectKey) {
  const result = spawnSync(
    "docker",
    [
      ...common,
      "exec",
      "-T",
      "-e",
      `WP9_OBJECT_KEY=${objectKey}`,
      "minio",
      "sh",
      "-ec",
      'mc alias set drill http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; mc pipe "drill/dawnlight-wp9-a-quarantine/$WP9_OBJECT_KEY" >/dev/null',
    ],
    { input: fixtureBytes, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      `Could not upload quarantine fixture: ${result.stderr || result.stdout}`,
    );
  }
}

async function waitFor(label, callback, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError}` : ""}`);
}

async function record(name, callback) {
  const started = Date.now();
  try {
    const evidence = await callback();
    report.checks.push({
      name,
      status: "passed",
      elapsedMs: Date.now() - started,
      evidence,
    });
    console.log(`PASS ${name}`);
    return evidence;
  } catch (error) {
    report.checks.push({
      name,
      status: "failed",
      elapsedMs: Date.now() - started,
      error:
        error instanceof Error ? error.message.slice(0, 1000) : String(error),
    });
    throw error;
  }
}

async function fetchArtifact(state, expectedDisposition = "available") {
  const url = `${publicOrigin}/artifacts/${state.published_object_key}`;
  const response = await fetch(url, { redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-sha256"), sha256);
  assert.equal(
    response.headers.get("x-dawnlight-disposition"),
    expectedDisposition,
  );
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(body).digest("hex"), sha256);
  return { status: response.status, sha256, disposition: expectedDisposition };
}

try {
  docker(["config", "--quiet"]);
  docker(["stop", "worker"]);

  const successSeed = await record("publication queue backlog", async () => {
    const state = database("seed", "success");
    upload(state.source_object_key);
    assert.equal(state.publication_backlog, true);
    assert.equal(state.artifact_status, null);
    return { submissionId: state.ids.submission, backlog: 1 };
  });
  void successSeed;

  docker(["up", "-d", "--no-deps", "worker"]);
  const published = await record("complete publication", async () => {
    const state = await waitFor("publication", () => {
      const current = database("state", "success");
      return current.version_status === "published" ? current : null;
    });
    assert.equal(state.submission_status, "published");
    assert.equal(state.artifact_status, "available");
    assert.equal(state.directory_version_status, "available");
    assert.equal(state.directory_artifact_status, "available");
    assert.equal(state.completed_runs, 1);
    assert.equal(state.feed_snapshots, 1);
    assert.equal(state.artifact_object_key, state.published_object_key);
    await fetchArtifact(state);
    const download = await fetch(
      `${publicOrigin}/api/v1/downloads/artifacts/${encodeURIComponent(state.artifact_id)}`,
      {
        redirect: "manual",
        headers: { "x-download-event-id": `${runId}-success` },
      },
    );
    assert.equal(download.status, 302);
    assert.equal(
      download.headers.get("location"),
      `${publicOrigin}/artifacts/${state.published_object_key}`,
    );
    const directory = await fetch(
      `${publicOrigin}/api/v1/directory/projects/${state.project_slug}/versions/${state.version}`,
    );
    assert.equal(directory.status, 200);
    const search = await fetch(
      `${publicOrigin}/api/v1/search?q=${encodeURIComponent(state.project_slug)}`,
    );
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert(
      searchBody.data.items.some(
        (item) => item.id === `community:${state.ids.project}`,
      ),
    );
    return {
      versionId: state.ids.version,
      artifactId: state.artifact_id,
      objectKey: state.published_object_key,
      feedSnapshots: state.feed_snapshots,
      publicStatus: 200,
      downloadStatus: 302,
    };
  });

  await record("ordinary withdrawal", async () => {
    const state = database("withdraw", "success");
    assert.equal(state.version_status, "withdrawn");
    assert.equal(state.submission_status, "withdrawn");
    assert.equal(state.artifact_status, "withdrawn");
    assert.equal(state.directory_project_status, "withdrawn");
    assert.equal(state.directory_version_status, "withdrawn");
    assert.equal(state.directory_artifact_status, "withdrawn");
    assert.equal(state.withdrawal_announcements, 1);
    assert.equal(state.withdrawal_audits, 1);
    const newDownload = await fetch(
      `${publicOrigin}/api/v1/downloads/artifacts/${encodeURIComponent(state.artifact_id)}`,
      {
        redirect: "manual",
        headers: { "x-download-event-id": `${runId}-withdrawn` },
      },
    );
    assert.equal(newDownload.status, 404);
    await fetchArtifact(state, "withdrawn");
    const search = await fetch(
      `${publicOrigin}/api/v1/search?q=${encodeURIComponent(state.project_slug)}`,
    );
    const searchBody = await search.json();
    assert(
      !searchBody.data.items.some(
        (item) => item.id === `community:${state.ids.project}`,
      ),
    );
    return {
      versionId: state.ids.version,
      newDownloadStatus: 404,
      knownUrlStatus: 200,
      knownUrlDisposition: "withdrawn",
      announcementCount: 1,
      auditCount: 1,
    };
  });

  docker(["stop", "worker"]);
  const faultSeed = database("seed", "storage-fault");
  upload(faultSeed.source_object_key);
  assert.equal(faultSeed.publication_backlog, true);
  docker(["stop", "minio"]);

  await record("object storage readiness fault", async () => {
    const response = await waitFor(
      "API readiness failure",
      async () => {
        const current = await fetch(`${publicOrigin}/health/ready`);
        return current.status === 503 ? current : null;
      },
      40_000,
    );
    return { readinessStatus: response.status, publicArtifactCreated: false };
  });

  docker(["up", "-d", "--no-deps", "worker"]);
  await record("failed publication visibility rollback", async () => {
    const state = await waitFor("publication infrastructure failure", () => {
      const current = database("state", "storage-fault");
      return current.failed_runs >= 1 ? current : null;
    });
    assert.equal(state.artifact_status, null);
    assert.equal(state.directory_version_status, null);
    assert.equal(state.directory_artifact_status, null);
    assert.equal(state.feed_snapshots, 0);
    const response = await fetch(
      `${publicOrigin}/artifacts/${state.published_object_key}`,
    );
    assert.equal(response.status, 404);
    return {
      failedRuns: state.failed_runs,
      artifactRows: 0,
      directoryRows: 0,
      feedSnapshots: 0,
      publicStatus: 404,
    };
  });

  docker(["start", "minio"]);
  await waitFor("MinIO recovery", async () => {
    const output = docker(["ps", "--format", "json", "minio"]);
    return output.includes("healthy") ? true : null;
  });
  await record("publication retry recovery", async () => {
    const state = await waitFor("publication retry", () => {
      const current = database("state", "storage-fault");
      return current.version_status === "published" ? current : null;
    });
    assert(state.failed_runs >= 1);
    assert.equal(state.completed_runs, 1);
    assert.equal(state.feed_snapshots, 1);
    assert.equal(state.artifact_status, "available");
    await fetchArtifact(state);
    return {
      failedRuns: state.failed_runs,
      completedRuns: state.completed_runs,
      feedSnapshots: state.feed_snapshots,
      publicStatus: 200,
    };
  });

  report.completedAt = new Date().toISOString();
  report.status = "passed";
  report.summary = {
    publishedVersionId: published.versionId,
    checksPassed: report.checks.length,
    checksFailed: 0,
  };
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.status = "failed";
  report.summary = {
    checksPassed: report.checks.filter((check) => check.status === "passed")
      .length,
    checksFailed: report.checks.filter((check) => check.status === "failed")
      .length,
  };
  throw error;
} finally {
  try {
    docker(["start", "minio"]);
    docker(["up", "-d", "--no-deps", "worker"]);
  } catch {
    // The report preserves the original failure; recovery remains operator-visible.
  }
  mkdirSync(dirname(reportFile), { recursive: true });
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`WP9-A release drill report: ${reportFile}`);
}
