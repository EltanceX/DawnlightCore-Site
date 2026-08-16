import contractMetadata from "../../../../contracts/dawnlight/preview/metadata.json";
import contractLock from "../../../../contracts/dawnlight/preview/contract-lock.json";
import contractCatalog from "../../../../contracts/dawnlight/preview/catalogs/summary.json";
import verification from "../../../../contracts/dawnlight/preview/examples/verification.json";
import minimalManifest from "../../../../contracts/dawnlight/preview/examples/minimal/shaderpack.json";

export const developerContract = {
  metadata: contractMetadata,
  lock: contractLock,
  catalog: contractCatalog,
  verification,
} as const;

export const contractExamples = {
  minimal: JSON.stringify(minimalManifest, null, 2),
} as const;

export type ContractExampleId = keyof typeof contractExamples;

export function getContractExample(id: ContractExampleId) {
  return contractExamples[id];
}
