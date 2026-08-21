import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPostgresOperationsDataService } from "../dist/index.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the disposable WP9-A drill.");
}
if (process.env.WP9_A_DRILL_CONFIRM !== "DISPOSABLE-STAGING") {
  throw new Error(
    "Set WP9_A_DRILL_CONFIRM=DISPOSABLE-STAGING; this drill intentionally leaves immutable audit evidence.",
  );
}

const pool = new Pool({ connectionString, max: 3 });
const operations = createPostgresOperationsDataService(pool);
const actorId = randomUUID();
const projectId = randomUUID();
const versionId = randomUUID();
const uploadId = randomUUID();
const validationId = randomUUID();
const submissionId = randomUUID();
const artifactId = randomUUID();
const suffix = versionId.slice(0, 8);
const artifactSha256 =
  process.env.WP9_A_DRILL_SHA256?.toLowerCase() ?? "a".repeat(64);
const artifactSize = Number.parseInt(
  process.env.WP9_A_DRILL_SIZE ?? "1024",
  10,
);
const objectKey =
  process.env.WP9_A_DRILL_OBJECT_KEY ??
  `shaderpacks/wp9-a-${suffix}/1.0/${artifactSha256}.zip`;
const publicOrigin = process.env.WP9_A_DRILL_PUBLIC_ORIGIN?.replace(/\/$/, "");
const publicUrl = `${publicOrigin ?? "http://wp9-a.invalid"}/artifacts/${objectKey}`;
const directoryProjectId = `community:${projectId}`;
const directoryVersionId = `community-version:${versionId}`;
const directoryArtifactId = `community-artifact:${versionId}`;

assert.match(artifactSha256, /^[a-f0-9]{64}$/);
assert(Number.isSafeInteger(artifactSize) && artifactSize > 0);
assert.match(objectKey, /^shaderpacks\/[a-zA-Z0-9._/-]+\.zip$/);

try {
  await pool.query(
    `insert into auth_users
       (id, display_name, email, email_normalized, status, is_platform_admin)
     values ($1,'WP9-A incident operator',$2,$2,'active',true)`,
    [actorId, `wp9-a-${suffix}@example.test`],
  );
  await pool.query(
    `insert into author_projects
       (id, slug, name, summary, license_spdx, status, created_by)
     values ($1,$2,'WP9-A takedown fixture',
       'Disposable first-stage incident drill fixture.','MIT','draft',$3)`,
    [projectId, `wp9-a-takedown-${suffix}`, actorId],
  );
  await pool.query(
    `insert into project_memberships(project_id,user_id,role)
     values ($1,$2,'owner')`,
    [projectId, actorId],
  );
  await pool.query(
    `insert into author_project_versions
       (id, project_id, version, channel, status, changelog, license_spdx,
        compatibility, artifact_declarations, revision, created_by,
        published_at)
     values ($1,$2,'1.0.0','preview','published','WP9-A drill','MIT',
       '[]','[]',1,$3,now())`,
    [versionId, projectId, actorId],
  );
  await pool.query(
    `insert into upload_sessions
       (id, project_id, project_version_id, created_by, object_key,
        original_file_name, expected_size, expected_content_type, status,
        expires_at, completed_at, object_size)
     values ($1,$2,$3,$4,$5,'fixture.zip',$6,'application/zip','passed',
       now() + interval '1 day',now(),$6)`,
    [
      uploadId,
      projectId,
      versionId,
      actorId,
      `quarantine/${uploadId}.zip`,
      artifactSize,
    ],
  );
  await pool.query(
    `insert into loader_validation_runs
       (id, upload_id, project_version_id, status, validator_image,
        cli_version, core_commit, input_sha256, attempt, exit_code,
        sections, started_at, completed_at)
     values ($1,$2,$3,'loader-passed',$4,'wp9-a-drill',$5,$6,1,0,'{}',now(),now())`,
    [
      validationId,
      uploadId,
      versionId,
      `validator@sha256:${"b".repeat(64)}`,
      "c".repeat(40),
      artifactSha256,
    ],
  );
  await pool.query(
    `insert into review_submissions
       (id, project_id, project_version_id, upload_id, validation_run_id,
        revision, status, frozen_metadata, submitted_by, published_at)
     values ($1,$2,$3,$4,$5,1,'published','{}',$6,now())`,
    [submissionId, projectId, versionId, uploadId, validationId, actorId],
  );
  await pool.query(
    `insert into published_artifacts
       (id, submission_id, project_version_id, source_upload_id, object_key,
        public_url, file_name, size, sha256, status)
     values ($1,$2,$3,$4,$5,$6,'fixture.zip',$7,$8,'available')`,
    [
      artifactId,
      submissionId,
      versionId,
      uploadId,
      objectKey,
      publicUrl,
      artifactSize,
      artifactSha256,
    ],
  );
  await pool.query(
    `insert into directory_projects
       (id, slug, name, summary, status, visibility, source_ref)
     values ($1,$2,'WP9-A fixture','Incident drill','available','published','{}')`,
    [directoryProjectId, `wp9-a-fixture-${suffix}`],
  );
  await pool.query(
    `insert into directory_project_versions
       (id, project_id, version, channel, status, verification,
        contract_version, core_commit, game_api_tag, manifest_version,
        settings_schema_version, artifact_ids, source_ref)
     values ($1,$2,'1.0.0','preview','available','loader-verified','wp9-a',
       $3,'API_1.9.2.1',1,1,array[$4],'{}')`,
    [
      directoryVersionId,
      directoryProjectId,
      "c".repeat(40),
      directoryArtifactId,
    ],
  );
  await pool.query(
    `insert into directory_artifacts
       (id, project_version_id, status, platform, architecture, gpu_class,
        file_name, size, sha256, download_url, source_ref)
     values ($1,$2,'available','any','any','unspecified','fixture.zip',$3,$4,$5,'{}')`,
    [
      directoryArtifactId,
      directoryVersionId,
      artifactSize,
      artifactSha256,
      publicUrl,
    ],
  );

  const before = await operations.resolvePublishedArtifact(objectKey);
  assert.equal(before.disposition, "available");
  if (publicOrigin) {
    const response = await fetch(publicUrl, { redirect: "manual" });
    assert.equal(
      response.status,
      200,
      `pre-takedown URL returned ${response.status}`,
    );
    assert.equal(
      Number.parseInt(response.headers.get("content-length") ?? "-1", 10),
      artifactSize,
    );
  }
  const takedownStartedAt = Date.now();
  const decision = await operations.takedownVersion(
    {
      actorId,
      requestId: `wp9-a-${suffix}`,
      idempotencyKey: `wp9-a-takedown-${suffix}`,
      requestHash: "d".repeat(64),
    },
    versionId,
    {
      category: "security",
      privateReason: "WP9-A confirmed security incident drill fixture.",
      publicNotice: "This disposable version is unavailable after review.",
    },
  );
  assert.equal(decision.evidenceStatus, "pending");
  await assert.rejects(
    operations.resolvePublishedArtifact(objectKey),
    (error) => error?.code === "ArtifactTakenDown" && error?.statusCode === 410,
  );
  const blockElapsedMs = Date.now() - takedownStartedAt;
  assert(blockElapsedMs < 15 * 60 * 1000, "P0 acknowledgement SLO exceeded");
  if (publicOrigin) {
    const response = await fetch(publicUrl, { redirect: "manual" });
    assert.equal(
      response.status,
      410,
      `post-takedown URL returned ${response.status}`,
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  const state = await pool.query(
    `select
       (select status from author_project_versions where id = $1) as version_status,
       (select status from published_artifacts where id = $2) as artifact_status,
       (select status from review_submissions where id = $4) as review_status,
       (select status from directory_project_versions where id = $5) as directory_version_status,
       (select status from directory_artifacts where id = $3) as directory_status,
       (select count(*)::int from audit_events
         where action = 'version.takedown' and resource_id = $1::text) as audit_count,
       (select count(*)::int from moderation_actions
         where action = 'takedown' and resource_id = $1::text) as moderation_count,
       (select count(*)::int from takedown_decisions
         where project_version_id = $1) as decision_count`,
    [
      versionId,
      artifactId,
      directoryArtifactId,
      submissionId,
      directoryVersionId,
    ],
  );
  assert.deepEqual(state.rows[0], {
    version_status: "taken-down",
    artifact_status: "taken-down",
    review_status: "taken-down",
    directory_version_status: "taken-down",
    directory_status: "taken-down",
    audit_count: 1,
    moderation_count: 1,
    decision_count: 1,
  });
  const candidates = await operations.listPendingTakedownEvidence();
  assert(candidates.some((item) => item.decisionId === decision.id));
  await assert.rejects(
    pool.query(
      "update takedown_decisions set public_notice = null where id = $1",
      [decision.id],
    ),
    /append-only/,
  );

  console.log(
    `WP9-A takedown database drill passed for ${versionId} (atomic block in ${blockElapsedMs} ms, 410, audit and evidence outbox).`,
  );
} finally {
  await pool.end();
}
