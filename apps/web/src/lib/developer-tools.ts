import ingestFixture from "../../../../contracts/dawnlight/preview/ingest-fixture.json";
import contractManifest from "../../../../contracts/dawnlight/preview/contract-manifest.json";
import contractLock from "../../../../contracts/dawnlight/preview/contract-lock.json";

export type ToolStatus = "preview" | "unavailable";

const fixture = ingestFixture;
const diagnosticDescriptions = {
  catalog:
    "检查 StageTemplate、Service、SemanticProvider 和 EngineDrawProvider 引用。",
  manifest: "检查可选服务和 Manifest 声明与当前 Catalog 的关系。",
} as const;
const catalogLabels = {
  "stage-template": ["stageTemplates", "Stage Templates"],
  service: ["services", "Services"],
  "semantic-provider": ["semanticProviders", "Semantic Providers"],
  "engine-draw-provider": ["engineDrawProviders", "EngineDraw Providers"],
} as const;

export const toolContract = {
  version: fixture.contract.version,
  status: fixture.contract.status,
  publicApiStatus: fixture.contract.publicApiStatus,
  coreCommit: fixture.contract.sourceCommit,
  gameApiTag: fixture.contract.gameApiTag,
  manifestVersions: fixture.contract.manifestVersions,
  contentDigest: fixture.contract.contentDigest,
  ingestManifestDigest: contractManifest.signature.signedPayloadSha256,
} as const;

export const contractVersions = [fixture.contract] as const;
export const catalogEntries = fixture.catalog;

export const diagnosticEntries = fixture.diagnostics.map((entry) => ({
  ...entry,
  label: entry.group === "catalog" ? "Catalog 诊断" : "Manifest 诊断",
  description:
    diagnosticDescriptions[entry.group as keyof typeof diagnosticDescriptions],
  status: "preview" as ToolStatus,
}));

export const catalogSections = [
  ...Object.entries(catalogLabels).map(([kind, [id, label]]) => ({
    id,
    label,
    items: fixture.catalog
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.id),
  })),
  {
    id: "capabilities",
    label: "Capabilities",
    items: fixture.capabilities.map((entry) => entry.id),
  },
] as const;

export const capabilityEntries = fixture.capabilities.map((entry) => ({
  ...entry,
  status: "preview" as ToolStatus,
  description:
    "当前 contract 只记录能力 ID；具体上限由同一 Core commit 的 runtime 结果决定。",
}));

export const graphAvailability = fixture.graph;
export const variantAvailability = fixture.variant;
export const emptyContractDiff = {
  from: fixture.contract.version,
  to: fixture.contract.version,
  added: [],
  removed: [],
  changed: [],
};

export type DiagnosticToolEntry = (typeof diagnosticEntries)[number];
export type CatalogToolEntry = (typeof catalogEntries)[number];
export type CapabilityToolEntry = (typeof capabilityEntries)[number];
export type GraphToolRecord = typeof graphAvailability;
export type VariantToolRecord = typeof variantAvailability;
export type ContractVersionToolEntry = (typeof contractVersions)[number];

export function getDiagnostic(code: string) {
  return diagnosticEntries.find((entry) => entry.code === code);
}

export function getCatalogSection(id: string) {
  return catalogSections.find((section) => section.id === id);
}

export function getContractSourceLock() {
  return contractLock;
}
