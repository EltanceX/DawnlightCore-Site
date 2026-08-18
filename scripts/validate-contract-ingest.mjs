import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const packageRoot = resolve("packages/contract-data");
if (!existsSync(resolve(packageRoot, "dist/node.js"))) {
  execFileSync("pnpm", ["--filter", "@dawnlight/contract-data", "build"], {
    stdio: "inherit",
  });
}
const { loadContractBundle } =
  await import("../packages/contract-data/dist/node.js");
const { createContractDataService, ContractDataError } =
  await import("../packages/contract-data/dist/index.js");

const bundle = loadContractBundle(resolve("contracts/dawnlight/preview"));
if (bundle.manifest.signature.status !== "unsigned-preview") {
  throw new Error("Preview fixture unexpectedly changed its signature status.");
}
if (bundle.lock.signatureVerification.productionEligible) {
  throw new Error("Unsigned preview fixture cannot be production eligible.");
}
const service = createContractDataService([bundle.fixture]);
const version = bundle.fixture.contract.version;
const [diagnostics, catalog, capabilities, graph, variant, diff] =
  await Promise.all([
    service.listDiagnostics(version),
    service.listCatalog(version),
    service.listCapabilities(version),
    service.getGraph(version),
    service.getVariant(version),
    service.diff(version, version),
  ]);
if (
  diagnostics.length !== bundle.lock.expectedRows.diagnostics ||
  catalog.length !== bundle.lock.expectedRows.catalog ||
  capabilities.length !== bundle.lock.expectedRows.capabilities ||
  graph.status !== "unavailable" ||
  variant.status !== "unavailable" ||
  diff.added.length !== 0 ||
  diff.removed.length !== 0 ||
  diff.changed.length !== 0
) {
  throw new Error(
    "Contract service fixture results do not match the ingest lock.",
  );
}
try {
  await service.getDiagnostic(version, "NotARealDiagnostic");
  throw new Error("Missing diagnostic unexpectedly succeeded.");
} catch (error) {
  if (
    !(error instanceof ContractDataError) ||
    error.code !== "ContractEntityNotFound"
  ) {
    throw error;
  }
}
console.log(
  `Contract ingest validation passed (${diagnostics.length} diagnostics, ${catalog.length} catalog IDs, ${capabilities.length} capabilities).`,
);
