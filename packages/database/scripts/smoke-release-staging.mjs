import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";
import { createPostgresOperationsDataService } from "../dist/index.js";

const { Pool } = pg;
const action = process.argv[2];
const fixture = process.env.WP9_A_DRILL_FIXTURE ?? "success";
const runId = process.env.WP9_A_DRILL_RUN_ID;
const connectionString = process.env.DATABASE_URL;

if (!new Set(["seed", "state", "withdraw"]).has(action)) {
  throw new Error("Usage: smoke-release-staging.mjs <seed|state|withdraw>.");
}
if (!new Set(["success", "storage-fault"]).has(fixture)) {
  throw new Error("WP9_A_DRILL_FIXTURE must be success or storage-fault.");
}
if (!connectionString || !runId) {
  throw new Error("DATABASE_URL and WP9_A_DRILL_RUN_ID are required.");
}
if (process.env.WP9_A_DRILL_CONFIRM !== "DISPOSABLE-STAGING") {
  throw new Error(
    "Set WP9_A_DRILL_CONFIRM=DISPOSABLE-STAGING; the drill leaves immutable audit evidence.",
  );
}

function deterministicUuid(name) {
  const hex = createHash("sha256")
    .update(`${runId}:${fixture}:${name}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex
    .slice(12, 16)
    .join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

const ids = Object.fromEntries(
  [
    "actor",
    "project",
    "version",
    "upload",
    "preflight",
    "validation",
    "submission",
  ].map((name) => [name, deterministicUuid(name)]),
);
const suffix = createHash("sha256")
  .update(`${runId}:${fixture}`)
  .digest("hex")
  .slice(0, 12);
const projectSlug = `wp9-a-${fixture}-${suffix}`;
const version = fixture === "success" ? "1.0.0" : "1.0.1";
const sha256 = process.env.WP9_A_DRILL_SHA256?.toLowerCase();
const size = Number.parseInt(process.env.WP9_A_DRILL_SIZE ?? "0", 10);
const sourceObjectKey = `quarantine/wp9-a-${fixture}-${suffix}.zip`;
const publishedObjectKey = `shaderpacks/${projectSlug}/${version}/${sha256}.zip`;
const artifactId = `community-artifact:${ids.version}`;
const publicOrigin = process.env.WP9_A_DRILL_PUBLIC_ORIGIN?.replace(/\/$/, "");

assert.match(runId, /^[A-Za-z0-9._-]{8,80}$/);
assert.match(sha256 ?? "", /^[a-f0-9]{64}$/);
assert(Number.isSafeInteger(size) && size > 0);

const pool = new Pool({ connectionString, max: 3 });
const operations = createPostgresOperationsDataService(pool);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(
      "select 1 from review_submissions where id = $1",
      [ids.submission],
    );
    assert.equal(existing.rowCount, 0, "drill fixture already exists");
    await client.query(
      `insert into auth_users
       (id, display_name, email, email_normalized, status, is_platform_admin)
       values ($1,'WP9-A release operator',$2,$2,'active',true)`,
      [ids.actor, `wp9-a-release-${fixture}-${suffix}@example.test`],
    );
    await client.query(
      `insert into author_projects
       (id, slug, name, summary, license_spdx, status, created_by)
       values ($1,$2,$3,'Disposable WP9-A publication drill fixture.','MIT','draft',$4)`,
      [ids.project, projectSlug, `WP9-A ${fixture} fixture`, ids.actor],
    );
    await client.query(
      "insert into project_memberships(project_id,user_id,role) values ($1,$2,'owner')",
      [ids.project, ids.actor],
    );
    const compatibility = [
      {
        coreRange: "wp9-a-drill",
        gameApiTag: "API_1.9.2.1",
        platforms: ["windows"],
        architectures: ["x64"],
        gpuClasses: ["test-fixture"],
        note: "Disposable first-stage compatibility declaration.",
      },
    ];
    const declarations = [
      { platform: "windows", architecture: "x64", gpuClass: "test-fixture" },
    ];
    const frozenMetadata = {
      channel: "preview",
      licenseSpdx: "MIT",
      compatibility,
      artifactDeclarations: declarations,
      evidenceClass: "prevalidated-wp9-a-fixture",
    };
    await client.query(
      `insert into author_project_versions
       (id, project_id, version, channel, status, changelog, license_spdx,
        compatibility, artifact_declarations, revision, created_by,
        frozen_metadata)
       values ($1,$2,$3,'preview','approved','WP9-A release drill','MIT',
        $4::jsonb,$5::jsonb,1,$6,$7::jsonb)`,
      [
        ids.version,
        ids.project,
        version,
        JSON.stringify(compatibility),
        JSON.stringify(declarations),
        ids.actor,
        JSON.stringify(frozenMetadata),
      ],
    );
    await client.query(
      `insert into upload_sessions
       (id, project_id, project_version_id, created_by, object_key,
        original_file_name, expected_size, expected_content_type, status,
        expires_at, completed_at, object_size)
       values ($1,$2,$3,$4,$5,$6,$7,'application/zip','passed',
        now() + interval '1 day',now(),$7)`,
      [
        ids.upload,
        ids.project,
        ids.version,
        ids.actor,
        sourceObjectKey,
        `${projectSlug}-${version}.zip`,
        size,
      ],
    );
    await client.query(
      `insert into preflight_runs
       (id, upload_id, status, worker_version, job_id, attempt, input_sha256,
        input_size, file_count, extracted_size, manifest, diagnostics, completed_at)
       values ($1,$2,'passed','wp9-a-prevalidated-fixture','wp9-a-fixture',1,$3,$4,
        1,$4,'[]','[]',now())`,
      [ids.preflight, ids.upload, sha256, size],
    );
    await client.query(
      "update author_project_versions set selected_upload_id = $2 where id = $1",
      [ids.version, ids.upload],
    );
    const sections = {
      schema: { status: "passed", summary: "WP9-A prevalidated fixture." },
      loader: {
        status: "passed",
        summary: "Synthetic result; not real Loader evidence.",
        details: { manifestVersion: 1, settingsSchemaVersion: 1 },
      },
      security: { status: "passed", summary: "Disposable fixture only." },
      resource: { status: "declared", summary: "Not measured in WP9-A." },
      compatibility: { status: "declared", summary: "Fixture declaration." },
    };
    await client.query(
      `insert into loader_validation_runs
       (id, upload_id, project_version_id, status, validator_image, cli_version,
        core_commit, input_sha256, attempt, job_id, exit_code, sections,
        log_summary, started_at, completed_at)
       values ($1,$2,$3,'loader-passed',$4,'wp9-a-prevalidated-fixture',$5,$6,1,
        'wp9-a-fixture',0,$7::jsonb,'Synthetic WP9-A result; not release evidence.',now(),now())`,
      [
        ids.validation,
        ids.upload,
        ids.version,
        `fixture@sha256:${"b".repeat(64)}`,
        "c".repeat(40),
        sha256,
        JSON.stringify(sections),
      ],
    );
    await client.query(
      `insert into review_submissions
       (id, project_id, project_version_id, upload_id, validation_run_id,
        revision, status, frozen_metadata, submitted_by, submitted_at, decided_at)
       values ($1,$2,$3,$4,$5,1,'approved',$6::jsonb,$7,now(),now())`,
      [
        ids.submission,
        ids.project,
        ids.version,
        ids.upload,
        ids.validation,
        JSON.stringify(frozenMetadata),
        ids.actor,
      ],
    );
    await client.query(
      "insert into publish_job_outbox(submission_id) values ($1)",
      [ids.submission],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return state();
}

async function state() {
  const result = await pool.query(
    `select
       $1::text as fixture,
       $2::text as project_slug,
       $3::text as version,
       $4::text as source_object_key,
       $5::text as published_object_key,
       $6::text as artifact_id,
       v.status as version_status,
       s.status as submission_status,
       o.dispatched_at is null as publication_backlog,
       o.dispatch_attempts,
       a.status as artifact_status,
       a.object_key as artifact_object_key,
       dp.status as directory_project_status,
       dv.status as directory_version_status,
       da.status as directory_artifact_status,
       (select count(*)::int from publication_runs r
         where r.submission_id = s.id and r.status = 'infrastructure-error') as failed_runs,
       (select count(*)::int from publication_runs r
         where r.submission_id = s.id and r.status = 'completed') as completed_runs,
       (select count(*)::int from release_feed_snapshots f
         where f.payload->'releases' @> $7::jsonb) as feed_snapshots,
       (select count(*)::int from withdrawal_announcements w
         where w.project_version_id = v.id) as withdrawal_announcements,
       (select count(*)::int from audit_events e
         where e.action = 'version.withdraw' and e.resource_id = v.id::text) as withdrawal_audits
     from author_project_versions v
     join review_submissions s on s.project_version_id = v.id
     join publish_job_outbox o on o.submission_id = s.id
     left join published_artifacts a on a.project_version_id = v.id
     left join directory_projects dp on dp.id = $11
     left join directory_project_versions dv on dv.id = $8
     left join directory_artifacts da on da.id = $6
     where v.id = $9 and s.id = $10`,
    [
      fixture,
      projectSlug,
      version,
      sourceObjectKey,
      publishedObjectKey,
      artifactId,
      JSON.stringify([{ versionId: ids.version }]),
      `community-version:${ids.version}`,
      ids.version,
      ids.submission,
      `community:${ids.project}`,
    ],
  );
  assert(result.rows[0], "drill fixture was not found");
  return { ...result.rows[0], ids, sha256, size, publicOrigin };
}

async function withdraw() {
  await operations.withdrawVersion(
    {
      actorId: ids.actor,
      requestId: `wp9-a-release-${suffix}`,
      idempotencyKey: `wp9-a-withdraw-${suffix}`,
      requestHash: createHash("sha256")
        .update(`${runId}:${fixture}:withdraw`)
        .digest("hex"),
    },
    ids.version,
    "WP9-A ordinary withdrawal lifecycle drill.",
  );
  return state();
}

try {
  const output =
    action === "seed"
      ? await seed()
      : action === "withdraw"
        ? await withdraw()
        : await state();
  console.log(`WP9_A_DRILL_JSON=${JSON.stringify(output)}`);
} finally {
  await pool.end();
}
