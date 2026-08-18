import directoryFixture from "../../../../contracts/dawnlight/preview/directory-fixture.json";
import type {
  CompatibilityRecord,
  DirectoryArtifact,
  DirectoryImage,
  DirectoryProject as DirectoryProjectRecord,
  LicenseRecord,
  ProjectVersion,
} from "@dawnlight/contract-data";
import { directoryFixtureSchema } from "@dawnlight/contract-data";

export type DirectoryProject = DirectoryProjectRecord & {
  latestVersion: ProjectVersion | null;
  versions: ProjectVersion[];
  artifacts: DirectoryArtifact[];
  compatibilities: CompatibilityRecord[];
  images: DirectoryImage[];
  license: LicenseRecord | null;
  recommendation: {
    artifact: DirectoryArtifact | null;
    reasons: string[];
    exclusions: string[];
  };
};

function projectView(project: DirectoryProjectRecord): DirectoryProject {
  const directoryData = directoryFixtureSchema.parse(directoryFixture);
  const versions = directoryData.projectVersions.filter(
    (version) => version.projectId === project.id,
  );
  const latestVersion = versions[0] ?? null;
  const artifacts = directoryData.artifacts.filter((artifact) =>
    versions.some((version) => version.id === artifact.projectVersionId),
  );
  const compatibilities = directoryData.compatibilities.filter(
    (compatibility) =>
      versions.some((version) => version.id === compatibility.projectVersionId),
  );
  const images = directoryData.images.filter((image) =>
    versions.some((version) => version.id === image.projectVersionId),
  );
  const license =
    directoryData.licenses.find((entry) => entry.id === project.licenseId) ??
    null;
  return {
    ...project,
    latestVersion,
    versions,
    artifacts,
    compatibilities,
    images,
    license,
    recommendation: {
      artifact:
        artifacts.find((artifact) => artifact.status === "available") ?? null,
      reasons: [
        artifacts.length > 0
          ? "artifact 已进入目录候选集。"
          : "当前版本没有可公开下载的 artifact。",
      ],
      exclusions:
        artifacts.length > 0
          ? []
          : ["metadata-only 或未验证版本不会生成下载链接。"],
    },
  };
}

export const directoryProjects: readonly DirectoryProject[] =
  directoryFixtureSchema.parse(directoryFixture).projects.map(projectView);

export const shaderProjects = directoryProjects;

export const directoryFilterOptions = {
  status: [
    { value: "all", label: "全部状态" },
    { value: "preview", label: "Preview" },
    { value: "metadata-only", label: "Metadata-only" },
    { value: "available", label: "可下载" },
    { value: "withdrawn", label: "已撤回" },
  ],
  channel: [
    { value: "all", label: "全部频道" },
    { value: "preview", label: "Preview" },
    { value: "stable", label: "Stable" },
    { value: "beta", label: "Beta" },
  ],
  license: [
    { value: "all", label: "全部许可证状态" },
    { value: "declared", label: "已声明" },
    { value: "unknown", label: "未核对" },
    { value: "restricted", label: "受限" },
  ],
} as const;

export function getShaderProject(slug: string) {
  return directoryProjects.find((project) => project.slug === slug);
}
