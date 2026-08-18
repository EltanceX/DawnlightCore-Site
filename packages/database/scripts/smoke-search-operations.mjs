import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import {
  createPostgresOperationsDataService,
  createPostgresSearchDataService,
} from "../dist/index.js";

const { Pool } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const suffix = randomUUID();
const adminId = randomUUID();
const projectId = `smoke:wp8:${suffix}`;
const versionId = `${projectId}@1.0.0`;
const artifactId = `${versionId}:windows-x64`;
const licenseId = `license:${projectId}`;
const compatibilityId = `compat:${versionId}`;
const hiddenProjectId = `smoke:hidden:${suffix}`;
const hiddenVersionId = `${hiddenProjectId}@1.0.0`;
const hiddenCompatibilityId = `compat:${hiddenVersionId}`;
const eventId = `wp8-success-${suffix}`;
const errorEventId = `wp8-error-${suffix}`;
const expiredEventId = `wp8-expired-${suffix}`;
const pool = new Pool({ connectionString, max: 3 });
const search = createPostgresSearchDataService(pool);
const operations = createPostgresOperationsDataService(pool);
let reportId = null;

try {
  await pool.query(
    `insert into auth_users
     (id, display_name, email, email_normalized, status, is_platform_admin)
     values ($1,'WP8 smoke operator',$2,$2,'active',true)`,
    [adminId, `wp8-${suffix}@example.test`],
  );
  await pool.query(
    `insert into directory_projects
     (id, slug, name, summary, status, visibility, license_id, source_ref)
     values
       ($1,$2,'WP8 Search Fixture','Public search and operations smoke fixture','available','published',$3,'{}'),
       ($4,$5,'Hidden WP8 Fixture','Must never contribute public facets','deprecated','public-candidate',null,'{}')`,
    [
      projectId,
      `wp8-search-${suffix}`,
      licenseId,
      hiddenProjectId,
      `wp8-hidden-${suffix}`,
    ],
  );
  await pool.query(
    `insert into directory_licenses
     (id, project_id, status, spdx_id, name, reason)
     values ($1,$2,'approved','MIT','MIT','WP8 smoke fixture')`,
    [licenseId, projectId],
  );
  await pool.query(
    `insert into directory_project_versions
     (id, project_id, version, channel, status, verification,
      contract_version, core_commit, game_api_tag, manifest_version,
      settings_schema_version, source_ref)
     values
       ($1,$2,'1.0.0','stable','available','loader-validated',
        'preview-2026-08-16',$3,'API_1.9.2.1',3,1,'{}'),
       ($4,$5,'1.0.0','stable','available','loader-validated',
        'preview-2026-08-16',$3,'API_1.9.2.1',3,1,'{}')`,
    [
      versionId,
      projectId,
      "de780e826a1a8537cf120600caf68e9d890737ac",
      hiddenVersionId,
      hiddenProjectId,
    ],
  );
  await pool.query(
    `insert into directory_compatibilities
     (id, project_version_id, status, core_range, game_api_tag,
      platforms, architectures, gpu_classes, reason)
     values
       ($1,$2,'compatible','de780e8','API_1.9.2.1',array['windows'],array['x64'],array['desktop'],'verified'),
       ($3,$4,'compatible','de780e8','API_1.9.2.1',array['hidden-os'],array['hidden-arch'],array['hidden-gpu'],'private')`,
    [compatibilityId, versionId, hiddenCompatibilityId, hiddenVersionId],
  );
  await pool.query(
    `insert into directory_artifacts
     (id, project_version_id, status, platform, architecture, gpu_class,
      file_name, size, sha256, download_url, source_ref)
     values ($1,$2,'available','windows','x64','desktop',$3,4096,$4,$5,'{}')`,
    [
      artifactId,
      versionId,
      "wp8-smoke.zip",
      "a".repeat(64),
      "https://cdn.example.test/wp8-smoke.zip",
    ],
  );

  const found = await search.search({
    q: "WP8 Search",
    kind: "version",
    platform: "windows",
    architecture: "x64",
    gpu: "desktop",
    license: "MIT",
  });
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0]?.id, versionId);
  assert.equal(
    found.items[0]?.url,
    `/zh-CN/shaders/wp8-search-${suffix}/?version=1.0.0`,
  );
  assert(found.facets.platform.includes("windows"));
  assert(!found.facets.platform.includes("hidden-os"));
  assert(!found.facets.architecture.includes("hidden-arch"));
  assert(!found.facets.gpu.includes("hidden-gpu"));
  assert(found.facets.license.includes("MIT"));

  const input = {
    eventId,
    edgeRegion: "local-smoke",
    sourceClass: "client",
  };
  const download = await operations.resolveDownload(artifactId, input);
  await operations.resolveDownload(artifactId, input);
  assert.equal(download.sha256, "a".repeat(64));
  const deduplicated = await pool.query(
    "select count(*)::int as count from download_events where event_id = $1",
    [createHash("sha256").update(eventId).digest("hex")],
  );
  assert.equal(deduplicated.rows[0]?.count, 1);

  await assert.rejects(
    operations.resolveDownload("missing-artifact", {
      eventId: errorEventId,
      edgeRegion: "local-smoke",
      sourceClass: "unknown",
    }),
    (error) => error?.code === "ArtifactNotFound",
  );
  const overview = await operations.getOverview(adminId, 7);
  assert(overview.downloads.success >= 1);
  assert(overview.downloads.errors >= 1);
  assert(overview.topArtifacts.some((item) => item.artifactId === artifactId));
  assert(
    overview.downloadErrors.some((item) => item.code === "ArtifactNotFound"),
  );

  const report = await operations.createReport({
    resourceId: projectId,
    contact: `report-${suffix}@example.test`,
    reason: "WP8 database smoke report for retention and operations queries.",
  });
  reportId = report.id;
  const reports = await operations.listReports(adminId, "received");
  assert(reports.some((item) => item.id === report.id));

  await operations.recordDownloadError(
    null,
    {
      eventId: expiredEventId,
      edgeRegion: "local-smoke",
      sourceClass: "unknown",
    },
    503,
    "ExpiredFixture",
  );
  await pool.query(
    "update download_events set created_at = now() - interval '400 days' where event_id = $1",
    [createHash("sha256").update(expiredEventId).digest("hex")],
  );
  await operations.purgeExpiredDownloadEvents(90);
  const expired = await pool.query(
    "select count(*)::int as count from download_events where event_id = $1",
    [createHash("sha256").update(expiredEventId).digest("hex")],
  );
  assert.equal(expired.rows[0]?.count, 0);

  console.log(
    "WP8 PostgreSQL smoke passed (search privacy, facets, downloads, dedupe, overview, reports and retention).",
  );
} finally {
  await pool.query(
    "delete from download_events where event_id = any($1::text[])",
    [
      [eventId, errorEventId, expiredEventId].map((value) =>
        createHash("sha256").update(value).digest("hex"),
      ),
    ],
  );
  if (reportId) {
    await pool.query("delete from account_operation_requests where id = $1", [
      reportId,
    ]);
  }
  await pool.query(
    "delete from directory_projects where id = any($1::text[])",
    [[projectId, hiddenProjectId]],
  );
  await pool.query("delete from auth_users where id = $1", [adminId]);
  await pool.end();
}
