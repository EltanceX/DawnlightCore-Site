import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContractBundle } from "../src/node.js";
import {
  ContractDataError,
  createContractDataService,
  createDirectoryDataService,
  DirectoryDataError,
} from "../src/index.js";

const bundle = loadContractBundle(
  resolve(process.cwd(), "../../contracts/dawnlight/preview"),
);
const service = createContractDataService([bundle.fixture]);
const version = bundle.fixture.contract.version;

describe("contract data service", () => {
  it("returns the normalized contract snapshot and unavailable boundaries", async () => {
    const summary = await service.getContract(version);
    const graph = await service.getGraph(version);
    const variant = await service.getVariant(version);
    expect(summary.sourceCommit).toBe(bundle.fixture.contract.sourceCommit);
    expect(graph.status).toBe("unavailable");
    expect(variant.status).toBe("unavailable");
  });

  it("explains missing identifiers and same-version diffs", async () => {
    await expect(
      service.getDiagnostic(version, "MissingCode"),
    ).rejects.toMatchObject({
      code: "ContractEntityNotFound",
      statusCode: 404,
    });
    await expect(service.diff(version, version)).resolves.toMatchObject({
      added: [],
      removed: [],
      changed: [],
    });
  });

  it("reports duplicate IDs across catalog kinds instead of guessing", async () => {
    const duplicateFixture = structuredClone(bundle.fixture);
    duplicateFixture.catalog.push({
      ...duplicateFixture.catalog[0],
      kind: "service",
    });
    const duplicateService = createContractDataService([duplicateFixture]);
    await expect(
      duplicateService.getCatalog(version, duplicateFixture.catalog[0].id),
    ).rejects.toMatchObject({
      code: "ContractIdentifierConflict",
      statusCode: 409,
    } satisfies Partial<ContractDataError>);
  });
});

const directoryFixture = {
  fixtureVersion: 1,
  catalogStatus: "preview",
  generatedAt: "2026-08-18T00:00:00+08:00",
  projects: [
    {
      id: "demo:project",
      slug: "demo-project",
      name: "Demo Project",
      summary: "Preview project",
      status: "preview",
      visibility: "public-candidate",
      licenseId: "license:demo",
      sourceRef: {
        path: "metadata.json",
        pointer: "/",
        commit: bundle.fixture.contract.sourceCommit,
      },
    },
  ],
  projectVersions: [
    {
      id: "demo:project@1.0",
      projectId: "demo:project",
      version: "1.0",
      channel: "preview",
      status: "metadata-only",
      verification: "schema-only",
      contractVersion: version,
      coreCommit: bundle.fixture.contract.sourceCommit,
      gameApiTag: "API_1.9.2.1",
      manifestVersion: 3,
      settingsSchemaVersion: 1,
      compatibilityIds: ["compat:demo"],
      artifactIds: [],
      imageIds: [],
      sourceRef: {
        path: "metadata.json",
        pointer: "/",
        commit: bundle.fixture.contract.sourceCommit,
      },
    },
  ],
  artifacts: [],
  compatibilities: [
    {
      id: "compat:demo",
      projectVersionId: "demo:project@1.0",
      status: "unverified",
      coreRange: bundle.fixture.contract.sourceCommit,
      gameApiTag: "API_1.9.2.1",
      platforms: [],
      architectures: [],
      gpuClasses: [],
      reason: "No Loader evidence",
    },
  ],
  images: [],
  licenses: [
    {
      id: "license:demo",
      projectId: "demo:project",
      status: "unknown",
      spdxId: null,
      name: null,
      url: null,
      reason: "No declaration",
    },
  ],
} as const;

describe("directory data service", () => {
  it("returns recommendation reasons without inventing artifacts", async () => {
    const directory = createDirectoryDataService(directoryFixture);
    const projects = await directory.listProjects({ gameApi: "API_1.9.2.1" });
    expect(projects).toHaveLength(1);
    expect(projects[0].recommendation.artifact).toBeNull();
    expect(projects[0].recommendation.exclusions[0]).toContain("metadata-only");
    await expect(
      directory.listProjects({ platform: "windows" }),
    ).resolves.toEqual([]);
  });

  it("uses explicit not-found errors for project and version URLs", async () => {
    const directory = createDirectoryDataService(directoryFixture);
    await expect(directory.getProject("missing")).rejects.toBeInstanceOf(
      DirectoryDataError,
    );
    await expect(
      directory.getVersion("demo-project", "2.0"),
    ).rejects.toMatchObject({
      code: "DirectoryVersionNotFound",
      statusCode: 404,
    });
  });
});
