import diagnostics from "../../../../contracts/dawnlight/preview/diagnostics/diagnostics.json";
import catalog from "../../../../contracts/dawnlight/preview/catalogs/summary.json";
import contractMetadata from "../../../../contracts/dawnlight/preview/metadata.json";
import contractLock from "../../../../contracts/dawnlight/preview/contract-lock.json";

export type ToolStatus = "preview" | "unavailable";

export const toolContract = {
  version: contractMetadata.contractVersion,
  status: contractMetadata.status,
  publicApiStatus: contractMetadata.publicApiStatus,
  coreCommit: contractLock.source.commit,
  gameApiTag: contractMetadata.candidate.gameApiTag,
  manifestVersions: contractMetadata.candidate.manifestVersions,
} as const;

const diagnosticGroups = [
  {
    id: "catalog",
    label: "Catalog 诊断",
    description:
      "检查 StageTemplate、Service、SemanticProvider 和 EngineDrawProvider 引用。",
    codes: diagnostics.catalog.codes,
  },
  {
    id: "manifest",
    label: "Manifest 诊断",
    description: "检查可选服务和 Manifest 声明与当前 Catalog 的关系。",
    codes: diagnostics.manifest.codes,
  },
] as const;

export const diagnosticEntries = diagnosticGroups.flatMap((group) =>
  group.codes.map((code) => ({
    ...group,
    code,
    status: "preview" as ToolStatus,
  })),
);

export const catalogSections = [
  {
    id: "stageTemplates",
    label: "Stage Templates",
    items: catalog.stageTemplates.ids,
  },
  { id: "services", label: "Services", items: catalog.services.ids },
  {
    id: "semanticProviders",
    label: "Semantic Providers",
    items: catalog.semanticProviders.ids,
  },
  {
    id: "engineDrawProviders",
    label: "EngineDraw Providers",
    items: catalog.engineDrawProviders.ids,
  },
  {
    id: "capabilities",
    label: "Capabilities",
    items: catalog.capabilities.ids,
  },
] as const;

export const capabilityEntries = catalog.capabilities.ids.map((id) => ({
  id,
  status: "preview" as ToolStatus,
  description:
    "当前 contract 只记录能力 ID；具体上限由同一 Core commit 的 runtime 结果决定。",
}));

export function getDiagnostic(code: string) {
  return diagnosticEntries.find((entry) => entry.code === code);
}

export function getCatalogSection(id: string) {
  return catalogSections.find((section) => section.id === id);
}
