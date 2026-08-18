import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContractBundle } from "../src/node.js";
import { ContractDataError, createContractDataService } from "../src/index.js";

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
