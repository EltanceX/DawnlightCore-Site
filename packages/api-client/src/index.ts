import type { components } from "./generated.js";

export const apiVersion = "v1" as const;

export type HealthLiveResponse = components["schemas"]["HealthLiveResponse"];
export type DependencyCheck = components["schemas"]["DependencyCheck"];
export type HealthReadyResponse = components["schemas"]["HealthReadyResponse"];
export type ContractSummary = components["schemas"]["ContractSummary"];
export type DiagnosticRecord = components["schemas"]["DiagnosticRecord"];
export type CatalogKind = components["schemas"]["CatalogKind"];
export type CatalogRecord = components["schemas"]["CatalogRecord"];
export type CapabilityRecord = components["schemas"]["CapabilityRecord"];
export type GraphRecord = components["schemas"]["GraphRecord"];
export type VariantRecord = components["schemas"]["VariantRecord"];
export type ContractDiff = components["schemas"]["ContractDiff"];
export type DirectoryProjectView =
  components["schemas"]["DirectoryProjectView"];
export type DirectoryProjectVersion =
  components["schemas"]["DirectoryProjectVersion"];
export type DirectoryArtifact = components["schemas"]["DirectoryArtifact"];
export type DirectoryCompatibility =
  components["schemas"]["DirectoryCompatibility"];
export type DirectoryImage = components["schemas"]["DirectoryImage"];
export type DirectoryLicense = components["schemas"]["DirectoryLicense"];
export type DirectoryRecommendation =
  components["schemas"]["DirectoryRecommendation"];
export type ApiError = components["schemas"]["ApiError"];

export type { components, operations, paths } from "./generated.js";
