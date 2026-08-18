import type { Pool } from "pg";
import {
  createDirectoryDataService,
  type DirectoryDataService,
  type DirectoryFixture,
} from "@dawnlight/contract-data";

async function loadFixture(pool: Pool): Promise<DirectoryFixture> {
  const [projects, versions, artifacts, compatibilities, images, licenses] =
    await Promise.all([
      pool.query(
        "select * from directory_projects where visibility = 'published' order by updated_at desc",
      ),
      pool.query(
        "select * from directory_project_versions order by version desc",
      ),
      pool.query("select * from directory_artifacts"),
      pool.query("select * from directory_compatibilities"),
      pool.query("select * from directory_images"),
      pool.query("select * from directory_licenses"),
    ]);
  return {
    fixtureVersion: 1,
    catalogStatus: "published",
    generatedAt: new Date().toISOString(),
    projects: projects.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      status: row.status,
      visibility: row.visibility,
      licenseId: row.license_id,
      sourceRef: row.source_ref,
    })),
    projectVersions: versions.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      version: row.version,
      channel: row.channel,
      status: row.status,
      verification: row.verification,
      contractVersion: row.contract_version,
      coreCommit: row.core_commit,
      gameApiTag: row.game_api_tag,
      manifestVersion: row.manifest_version,
      settingsSchemaVersion: row.settings_schema_version,
      compatibilityIds: row.compatibility_ids,
      artifactIds: row.artifact_ids,
      imageIds: row.image_ids,
      sourceRef: row.source_ref,
    })),
    artifacts: artifacts.rows.map((row) => ({
      id: row.id,
      projectVersionId: row.project_version_id,
      status: row.status,
      platform: row.platform,
      architecture: row.architecture,
      gpuClass: row.gpu_class,
      fileName: row.file_name,
      size: Number(row.size),
      sha256: row.sha256,
      downloadUrl: row.download_url,
      sourceRef: row.source_ref,
    })),
    compatibilities: compatibilities.rows.map((row) => ({
      id: row.id,
      projectVersionId: row.project_version_id,
      status: row.status,
      coreRange: row.core_range,
      gameApiTag: row.game_api_tag,
      platforms: row.platforms,
      architectures: row.architectures,
      gpuClasses: row.gpu_classes,
      reason: row.reason,
    })),
    images: images.rows.map((row) => ({
      id: row.id,
      projectVersionId: row.project_version_id,
      status: row.status,
      url: row.url,
      alt: row.alt,
      reason: row.reason,
    })),
    licenses: licenses.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      spdxId: row.spdx_id,
      name: row.name,
      url: row.url,
      reason: row.reason,
    })),
  } as DirectoryFixture;
}

export function createPostgresDirectoryDataService(
  pool: Pool,
): DirectoryDataService {
  const service = async () =>
    createDirectoryDataService(await loadFixture(pool));
  return {
    async listProjects(query) {
      return (await service()).listProjects(query);
    },
    async getProject(slug) {
      return (await service()).getProject(slug);
    },
    async getVersion(slug, version) {
      return (await service()).getVersion(slug, version);
    },
  };
}
