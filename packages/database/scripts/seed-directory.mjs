import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://dawnlight:dawnlight@127.0.0.1:55432/dawnlight_v2";
const fixturePath = resolve(
  process.env.DAWNLIGHT_DIRECTORY_FIXTURE ??
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../contracts/dawnlight/preview/directory-fixture.json",
    ),
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const client = new Client({ connectionString });

await client.connect();
try {
  await client.query("begin");
  for (const project of fixture.projects) {
    await client.query(
      `insert into directory_projects
        (id, slug, name, summary, status, visibility, license_id, source_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       on conflict (id) do update set
         slug=excluded.slug, name=excluded.name, summary=excluded.summary,
         status=excluded.status, visibility=excluded.visibility,
         license_id=excluded.license_id, source_ref=excluded.source_ref,
         updated_at=now()`,
      [
        project.id,
        project.slug,
        project.name,
        project.summary,
        project.status,
        project.visibility,
        project.licenseId,
        JSON.stringify(project.sourceRef),
      ],
    );
  }
  for (const version of fixture.projectVersions) {
    await client.query(
      `insert into directory_project_versions
        (id, project_id, version, channel, status, verification, contract_version,
         core_commit, game_api_tag, manifest_version, settings_schema_version,
         compatibility_ids, artifact_ids, image_ids, source_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       on conflict (id) do update set
         status=excluded.status, verification=excluded.verification,
         contract_version=excluded.contract_version, core_commit=excluded.core_commit,
         game_api_tag=excluded.game_api_tag, manifest_version=excluded.manifest_version,
         settings_schema_version=excluded.settings_schema_version,
         compatibility_ids=excluded.compatibility_ids, artifact_ids=excluded.artifact_ids,
         image_ids=excluded.image_ids, source_ref=excluded.source_ref`,
      [
        version.id,
        version.projectId,
        version.version,
        version.channel,
        version.status,
        version.verification,
        version.contractVersion,
        version.coreCommit,
        version.gameApiTag,
        version.manifestVersion,
        version.settingsSchemaVersion,
        version.compatibilityIds,
        version.artifactIds,
        version.imageIds,
        JSON.stringify(version.sourceRef),
      ],
    );
  }
  for (const artifact of fixture.artifacts) {
    await client.query(
      `insert into directory_artifacts
        (id, project_version_id, status, platform, architecture, gpu_class,
         file_name, size, sha256, download_url, source_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       on conflict (id) do update set status=excluded.status,
         download_url=excluded.download_url, source_ref=excluded.source_ref`,
      [
        artifact.id,
        artifact.projectVersionId,
        artifact.status,
        artifact.platform,
        artifact.architecture,
        artifact.gpuClass,
        artifact.fileName,
        artifact.size,
        artifact.sha256,
        artifact.downloadUrl,
        JSON.stringify(artifact.sourceRef),
      ],
    );
  }
  for (const compatibility of fixture.compatibilities) {
    await client.query(
      `insert into directory_compatibilities
        (id, project_version_id, status, core_range, game_api_tag, platforms,
         architectures, gpu_classes, reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set status=excluded.status,
         core_range=excluded.core_range, game_api_tag=excluded.game_api_tag,
         platforms=excluded.platforms, architectures=excluded.architectures,
         gpu_classes=excluded.gpu_classes, reason=excluded.reason`,
      [
        compatibility.id,
        compatibility.projectVersionId,
        compatibility.status,
        compatibility.coreRange,
        compatibility.gameApiTag,
        compatibility.platforms,
        compatibility.architectures,
        compatibility.gpuClasses,
        compatibility.reason,
      ],
    );
  }
  for (const image of fixture.images) {
    await client.query(
      `insert into directory_images
        (id, project_version_id, status, url, alt, reason)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set status=excluded.status, url=excluded.url,
         alt=excluded.alt, reason=excluded.reason`,
      [
        image.id,
        image.projectVersionId,
        image.status,
        image.url,
        image.alt,
        image.reason,
      ],
    );
  }
  for (const license of fixture.licenses) {
    await client.query(
      `insert into directory_licenses
        (id, project_id, status, spdx_id, name, url, reason)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set status=excluded.status,
         spdx_id=excluded.spdx_id, name=excluded.name, url=excluded.url,
         reason=excluded.reason`,
      [
        license.id,
        license.projectId,
        license.status,
        license.spdxId,
        license.name,
        license.url,
        license.reason,
      ],
    );
  }
  await client.query("commit");
  console.log(
    `Directory seed upserted ${fixture.projects.length} projects, ${fixture.projectVersions.length} versions, ${fixture.artifacts.length} artifacts.`,
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
