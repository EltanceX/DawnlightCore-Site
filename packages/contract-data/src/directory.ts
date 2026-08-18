import { z } from "zod";

const directoryStatusSchema = z.enum([
  "preview",
  "available",
  "unverified",
  "metadata-only",
  "withdrawn",
  "deprecated",
]);
const sourceRefSchema = z.object({
  path: z.string().min(1),
  pointer: z.string(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
});

export const directoryFixtureSchema = z.object({
  fixtureVersion: z.literal(1),
  catalogStatus: z.enum(["preview", "published"]),
  generatedAt: z.string().min(1),
  projects: z.array(
    z.object({
      id: z.string().min(1),
      slug: z.string().min(1),
      name: z.string().min(1),
      summary: z.string().min(1),
      status: directoryStatusSchema,
      visibility: z.enum(["public-candidate", "published"]),
      licenseId: z.string().min(1).nullable(),
      sourceRef: sourceRefSchema,
    }),
  ),
  projectVersions: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      version: z.string().min(1),
      channel: z.enum(["preview", "stable", "beta", "alpha"]),
      status: directoryStatusSchema,
      verification: z.enum([
        "schema-only",
        "loader-verified",
        "device-verified",
      ]),
      contractVersion: z.string().min(1),
      coreCommit: z.string().regex(/^[0-9a-f]{40}$/),
      gameApiTag: z.string().min(1),
      manifestVersion: z.number().int().positive(),
      settingsSchemaVersion: z.number().int().positive(),
      compatibilityIds: z.array(z.string().min(1)),
      artifactIds: z.array(z.string().min(1)),
      imageIds: z.array(z.string().min(1)),
      sourceRef: sourceRefSchema,
    }),
  ),
  artifacts: z.array(
    z.object({
      id: z.string().min(1),
      projectVersionId: z.string().min(1),
      status: z.enum(["available", "unverified", "quarantine", "withdrawn"]),
      platform: z.string().min(1),
      architecture: z.string().min(1),
      gpuClass: z.string().min(1),
      fileName: z.string().min(1),
      size: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      downloadUrl: z.string().url(),
      sourceRef: sourceRefSchema,
    }),
  ),
  compatibilities: z.array(
    z.object({
      id: z.string().min(1),
      projectVersionId: z.string().min(1),
      status: z.enum(["unverified", "compatible", "incompatible", "partial"]),
      coreRange: z.string().min(1),
      gameApiTag: z.string().min(1),
      platforms: z.array(z.string()),
      architectures: z.array(z.string()),
      gpuClasses: z.array(z.string()),
      reason: z.string().min(1),
    }),
  ),
  images: z.array(
    z.object({
      id: z.string().min(1),
      projectVersionId: z.string().min(1),
      status: z.enum(["available", "unavailable"]),
      url: z.string().url().nullable(),
      alt: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  licenses: z.array(
    z.object({
      id: z.string().min(1),
      projectId: z.string().min(1),
      status: z.enum(["declared", "unknown", "restricted"]),
      spdxId: z.string().nullable(),
      name: z.string().nullable(),
      url: z.string().url().nullable(),
      reason: z.string().min(1),
    }),
  ),
});

export type DirectoryFixture = z.infer<typeof directoryFixtureSchema>;
export type DirectoryProject = DirectoryFixture["projects"][number];
export type ProjectVersion = DirectoryFixture["projectVersions"][number];
export type DirectoryArtifact = DirectoryFixture["artifacts"][number];
export type CompatibilityRecord = DirectoryFixture["compatibilities"][number];
export type DirectoryImage = DirectoryFixture["images"][number];
export type LicenseRecord = DirectoryFixture["licenses"][number];

export type DirectoryQuery = {
  q?: string;
  core?: string;
  gameApi?: string;
  platform?: string;
  architecture?: string;
  gpu?: string;
  channel?: string;
  license?: string;
  status?: string;
};

export type DirectoryProjectView = DirectoryProject & {
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

export type DirectoryDataService = {
  listProjects(query?: DirectoryQuery): Promise<DirectoryProjectView[]>;
  getProject(slug: string): Promise<DirectoryProjectView>;
  getVersion(slug: string, version: string): Promise<DirectoryProjectView>;
};

export class DirectoryDataError extends Error {
  constructor(
    readonly code: "DirectoryProjectNotFound" | "DirectoryVersionNotFound",
    message: string,
    readonly statusCode: 404,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DirectoryDataError";
  }
}

function includesQuery(value: string, query: string | undefined) {
  return (
    !query || value.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
}

export function createDirectoryDataService(
  input: DirectoryFixture,
): DirectoryDataService {
  const fixture = directoryFixtureSchema.parse(input);
  const buildView = (
    project: DirectoryProject,
    version?: ProjectVersion,
  ): DirectoryProjectView => {
    const versions = fixture.projectVersions.filter(
      (item) => item.projectId === project.id,
    );
    const selected = version ?? versions[0] ?? null;
    const selectedVersions = selected ? [selected] : versions;
    const artifacts = fixture.artifacts.filter((artifact) =>
      selectedVersions.some((item) => item.id === artifact.projectVersionId),
    );
    const compatibilities = fixture.compatibilities.filter((compatibility) =>
      selectedVersions.some(
        (item) => item.id === compatibility.projectVersionId,
      ),
    );
    const images = fixture.images.filter((image) =>
      selectedVersions.some((item) => item.id === image.projectVersionId),
    );
    const license =
      fixture.licenses.find((item) => item.id === project.licenseId) ?? null;
    const availableArtifact =
      artifacts.find((artifact) => artifact.status === "available") ?? null;
    const reasons = availableArtifact
      ? ["artifact 已通过目录状态筛选。"]
      : ["当前版本没有可公开下载的 artifact。"];
    const exclusions = availableArtifact
      ? []
      : ["metadata-only 或未验证版本不会生成下载链接。"];
    return {
      ...project,
      latestVersion: versions[0] ?? null,
      versions,
      artifacts,
      compatibilities,
      images,
      license,
      recommendation: { artifact: availableArtifact, reasons, exclusions },
    };
  };

  const matches = (view: DirectoryProjectView, query: DirectoryQuery) => {
    const latest = view.latestVersion;
    const compatibility = view.compatibilities[0];
    const searchable = [
      view.id,
      view.slug,
      view.name,
      view.summary,
      latest?.version,
      latest?.gameApiTag,
      latest?.coreCommit,
      compatibility?.platforms.join(" "),
      compatibility?.architectures.join(" "),
      compatibility?.gpuClasses.join(" "),
      view.license?.spdxId,
    ]
      .filter(Boolean)
      .join(" ");
    if (!includesQuery(searchable, query.q)) return false;
    if (query.core && !latest?.coreCommit.startsWith(query.core)) return false;
    if (query.gameApi && latest?.gameApiTag !== query.gameApi) return false;
    if (query.channel && latest?.channel !== query.channel) return false;
    if (
      query.status &&
      view.status !== query.status &&
      latest?.status !== query.status
    )
      return false;
    if (query.license && (view.license?.status ?? "unknown") !== query.license)
      return false;
    if (query.platform && !compatibility?.platforms.includes(query.platform))
      return false;
    if (
      query.architecture &&
      !compatibility?.architectures.includes(query.architecture)
    )
      return false;
    if (query.gpu && !compatibility?.gpuClasses.includes(query.gpu))
      return false;
    return true;
  };

  const findProject = (slug: string) => {
    const project = fixture.projects.find((item) => item.slug === slug);
    if (!project) {
      throw new DirectoryDataError(
        "DirectoryProjectNotFound",
        `Directory project ${slug} does not exist.`,
        404,
        { slug },
      );
    }
    return project;
  };

  return {
    async listProjects(query = {}) {
      return fixture.projects
        .map((project) => buildView(project))
        .filter((view) => matches(view, query));
    },
    async getProject(slug) {
      return buildView(findProject(slug));
    },
    async getVersion(slug, version) {
      const project = findProject(slug);
      const projectVersion = fixture.projectVersions.find(
        (item) => item.projectId === project.id && item.version === version,
      );
      if (!projectVersion) {
        throw new DirectoryDataError(
          "DirectoryVersionNotFound",
          `Project version ${version} does not exist.`,
          404,
          { slug, version },
        );
      }
      return buildView(project, projectVersion);
    },
  };
}
